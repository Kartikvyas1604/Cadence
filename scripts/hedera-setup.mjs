#!/usr/bin/env node
/**
 * One-time setup: associate the payer account with Hedera testnet USDC
 * (0.0.429274) so it can hold + spend the x402 payment asset.
 * Run: node scripts/hedera-setup.mjs   (reads HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY)
 */
import { AccountId, PrivateKey, TokenAssociateTransaction, Client } from '@hiero-ledger/sdk';

const id = process.env.HEDERA_ACCOUNT_ID || '0.0.10392210';
const pk = process.env.HEDERA_PRIVATE_KEY || '0xeb2a9d59047f07624d38bc28d5dc2b0e7f41bca5b292628aecf404263ed2b4f5';

const client = Client.forTestnet();
const key = PrivateKey.fromStringECDSA(pk);
client.setOperator(id, key);

const tx = await new TokenAssociateTransaction()
  .setAccountId(id)
  .setTokenIds(['0.0.429274'])
  .freezeWith(client)
  .sign(key);

const resp = await tx.execute(client);
const rec = await resp.getRecord(client);
console.log('associate status:', rec.receipt.status.toString());
