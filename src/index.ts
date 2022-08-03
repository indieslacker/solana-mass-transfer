import {
    MintLayout,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    createCloseAccountInstruction,
    createTransferInstruction,
} from '@solana/spl-token';
import {
    ParsedAccountData,
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    SYSVAR_RENT_PUBKEY,
    PublicKey,
    TransactionInstruction,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { readFile } from 'fs/promises';
import bs58 from 'bs58';
import fetch from 'node-fetch';

/* Number of decimals for the token */
const TOKEN_DECIMALS = 0;

const ACTION = 'send_all';

const NODE = 'https://ssc-dao.genesysgo.net/';

const SENDS_IN_ONE_TX = 5;
const CLOSES_IN_ONE_TX = 27;

const DESTINATION = new PublicKey('F7hYeimWaUBru7FxNSt2GH7bMe4FzwW4sATa1k2mTGnZ');

const tokenProgram = TOKEN_PROGRAM_ID;

export const WRAPPED_SOL: string = 'So11111111111111111111111111111111111111112';

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getTokenAccounts(connection: Connection, publicKey: PublicKey, empty: boolean = false) {
    let i = 0;

    while (true) {
        try {
            const { value } = await connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: TOKEN_PROGRAM_ID },
            );

            const nftAccounts = value.filter(({ account }) => {
                if (account.data.parsed.info.mint === WRAPPED_SOL) {
                    return false;
                }

                const amount = account.data.parsed.info.tokenAmount.uiAmount;

                if (empty) {
                    return amount === 0;
                } else {
                    return amount > 0;
                }
            }).map(({ account, pubkey }) => {
                const amounts = account?.data?.parsed?.info?.tokenAmount;

                return {
                    mint: account.data.parsed.info.mint,
                    tokenAcc: pubkey,
                    count: Number(amounts.amount),
                    uiAmount: Number(amounts.uiAmount),
                };
            });

            return nftAccounts;
        } catch (err) {
            console.log(err);
            i++;

            if (i > 3) {
                throw err;
            } else {
                continue;
            }
        }
    }
}

async function createATAInstruction(
    mint: string,
    walletKeyPair: Keypair,
    connection,
) {
    const ata = await getAssociatedTokenAddress(
        new PublicKey(mint),
        DESTINATION,
    );

    const info = await connection.getAccountInfo(ata);

    /* ATA already exists for mint */
    if (info) {
        return undefined;
    }

    return createAssociatedTokenAccountInstruction(
        walletKeyPair.publicKey,
        ata,
        DESTINATION,
        new PublicKey(mint),
    );
}

async function createTransferTokenInstruction(
    mint: string,
    count: number,
    walletKeyPair: Keypair,
    tokenAcc: PublicKey,
) {
    const destinationATA = await getAssociatedTokenAddress(
        new PublicKey(mint),
        DESTINATION,
    );

    return createTransferInstruction(
        tokenAcc,
        destinationATA,
        walletKeyPair.publicKey,
        count,
        [],
        tokenProgram,
    );
}

function formatSOL(lamports: number) {
    return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

async function sendRemainingSOL(
    walletKeyPair: Keypair,
    connection: Connection,
) {
    console.log(`\nSending Solana to destination...\n`);

    try {
        const balance = await connection.getBalance(walletKeyPair.publicKey);

        const toSend = balance - (0.01 * LAMPORTS_PER_SOL);

        if (toSend <= 0.0001 * LAMPORTS_PER_SOL) {
            console.log('No funds to send.');
        }

        const transaction = new Transaction();

        transaction.add(SystemProgram.transfer({
            fromPubkey: walletKeyPair.publicKey,
            toPubkey: DESTINATION,
            lamports: toSend,
        }));

        console.log(`Sending ${formatSOL(toSend)} SOL to ${DESTINATION.toString()}`);

        const hash = await connection.sendTransaction(
            transaction,
            [ walletKeyPair ],
        );

        console.log('Complete.');
    } catch (err) {
        console.log(`Error sending SOL: ${err.toString()}`);
    }
}

async function closeAccounts(
    walletKeyPair: Keypair,
    connection: Connection,
) {
    console.log(`\nClosing emptied accounts to reclaim sol...\n`);

    while (true) {
        const emptyAccounts = await getTokenAccounts(connection, walletKeyPair.publicKey, true);

        if (emptyAccounts.length === 0) {
            console.log(`Finished closing empty accounts.`);
            break;
        }

        console.log(`Found ${emptyAccounts.length} empty accounts...`);

        const txsNeeded = Math.ceil(emptyAccounts.length / CLOSES_IN_ONE_TX);

        for (let i = 0; i < emptyAccounts.length / CLOSES_IN_ONE_TX; i++) {
            const itemsRemaining = Math.min(CLOSES_IN_ONE_TX, emptyAccounts.length - i * CLOSES_IN_ONE_TX);

            const transaction = new Transaction();

            for (let j = 0; j < itemsRemaining; j++) {
                const item = i * CLOSES_IN_ONE_TX + j;

                const acc = emptyAccounts[item];

                transaction.add(createCloseAccountInstruction(
                    acc.tokenAcc,
                    walletKeyPair.publicKey,
                    walletKeyPair.publicKey,
                ));
            }

            console.log(`Sending transaction ${i+1} / ${txsNeeded}...`);

            try {
                const res = await connection.sendTransaction(
                    transaction,
                    [walletKeyPair]
                );
            } catch (err) {
                console.log(`Error sending transaction: ${err.toString()}`);
            }
        }

        await sleep(10 * 1000);
    }
}

async function sendAll(
    walletKeyPair: Keypair,
    connection: Connection,
) {
    console.log(`\nTransferring NFTs and tokens to destination...\n`);

    while (true) {
        const accounts = await getTokenAccounts(connection, walletKeyPair.publicKey);

        if (accounts.length === 0) {
            console.log(`Finished transferring NFTs and tokens.`);
            break;
        }

        console.log(`Found ${accounts.length} accounts...`);

        const txsNeeded = Math.ceil(accounts.length / SENDS_IN_ONE_TX);

        for (let i = 0; i < accounts.length / SENDS_IN_ONE_TX; i++) {
            const itemsRemaining = Math.min(SENDS_IN_ONE_TX, accounts.length - i * SENDS_IN_ONE_TX);

            const transaction = new Transaction();

            for (let j = 0; j < itemsRemaining; j++) {
                const item = i * SENDS_IN_ONE_TX + j;

                const acc = accounts[item];

                const createATA = await createATAInstruction(
                    acc.mint,
                    walletKeyPair,
                    connection,
                );

                if (createATA) {
                    transaction.add(createATA);
                }

                const transfer = await createTransferTokenInstruction(
                    acc.mint,
                    acc.count,
                    walletKeyPair,
                    acc.tokenAcc,
                );

                transaction.add(transfer);
            }

            console.log(`Sending transaction ${i+1} / ${txsNeeded}...`);

            try {
                const res = await connection.sendTransaction(
                    transaction,
                    [walletKeyPair]
                );
            } catch (err) {
                console.log(`Error sending transaction: ${err.toString()}`);
            }
        }

        await sleep(10 * 1000);
    }

    await closeAccounts(
        walletKeyPair,
        connection,
    );

    await sendRemainingSOL(
        walletKeyPair,
        connection,
    );
}

async function loadPrivateKey(filename: string): Promise<Keypair> {
    const privateKey = JSON.parse((await readFile(filename, { encoding: 'utf-8' })));
    const bytes = bs58.decode(privateKey);
    const wallet = Keypair.fromSecretKey(new Uint8Array(bytes));
    return wallet;
}

async function loadSeed(filename: string): Promise<Keypair> {
    const privateKey = JSON.parse((await readFile(filename, { encoding: 'utf-8' })));
    const wallet = Keypair.fromSecretKey(new Uint8Array(privateKey));
    return wallet;
}

async function main() {
    const wallet = await loadSeed('privateKey.json');

    console.log(`Wallet: ${wallet.publicKey.toString()}`);

    const connection = new Connection(NODE, {
        confirmTransactionInitialTimeout: 60 * 1000,
        commitment: 'confirmed',
    });

    switch (ACTION as string) {
        case 'send_all': {
            await sendAll(
                wallet,
                connection,
            );

            break;
        }
    }
}

main()
    .catch((err) => {
        console.log(`Error executing script: ${err.toString()}`);
    });
