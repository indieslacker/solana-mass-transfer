# mass-transfer
Moves all assets from one wallet to another

### Configuration

Modify the following variables:

```js
const DESTINATION = new PublicKey('F7hYeimWaUBru7FxNSt2GH7bMe4FzwW4sATa1k2mTGnZ');
```

Replace with the desired address.

You can change `loadSeed` to `loadPrivateKey` if you have the private key in a base58 format, if you exported from phantom, for example.

Private key for address to move assets from should be located in `privateKey.json`.

Example:

```json
[251,204,206,182,109,188,156,211,71,63,211,46,193,53,166,0,232,96,64,183,51,199,34,40,134,65,76,19,215,167,134,6,9,101,234,98,247,199,77,184,236,192,250,110,96,246,145,124,139,138,12,45,124,94,217,100,79,101,142,90,187,32,53,142]
```

Example base58 format:

```json
"6Tyktf6mEqUMEKm2ZpLn3srEwk9zsT5jiE54EgPgToikMFYww1LGFUXgwgr6hvc9CikpaNaBH2vmkmqN3Usrxpd"
```

### Running

* `yarn install`
* `yarn build && yarn start`

Note that you need enough solana to transfer all your tokens to the new address.
This will be reclaimed when we close the empty accounts afterwards.
