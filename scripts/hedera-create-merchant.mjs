#!/usr/bin/env node
/**
 * Creates the intel merchant account (fresh ECDSA key) on Hedera testnet:
 *   1. generate keypair
 *   2. account create (2 HBAR, funded by the payer account)
 *   3. associate USDC 0.0.429274 (so it can receive x402 slot-ask fees)
 * Prints ACCOUNT_ID / EVM / PRIVATE KEY — put ACCOUNT_ID in PAY_TO.
 * Run: node scripts/hedera-create-merchant.mjs
 */
import { AccountId, PrivateKey, Hbar, AccountCreateTransaction, TokenAssociateTransaction, Client } from '@hiero-ledger/sdk';

const PAYER_ID = process.env.HEDERA_ACCOUNT_ID || '0.0.10392210';
const PAYER_KEY = PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY || '0xeb2a9d59047f07624d38bc28d5dc2b0e7f41bca5b292628aecf404263ed2b4f5');

const client = Client.forTestnet();
client.setOperator(PAYER_ID, PAYER_KEY);

// 1. generate the merchant keypair + create the account
const merchantKey = PrivateKey.generateECDSA();
const create = await new AccountCreateTransaction()
  .setKey(merchantKey.publicKey)
  .setInitialBalance(new Hbar(2))
  .freezeWith(client)
  .sign(PAYER_KEY);
const resp = await create.execute(client);
const rec = await resp.getRecord(client);
const merchantId = rec.receipt.accountId.toString();
console.log('merchant account:', String(merchantId));
console.log('merchant private key (hex):', merchantKey.toStringRaw());

// 2. associate testnet USDC so fees can land
const assoc = await new TokenAssociateTransaction()
  .setAccountId(String(rec.receipt.accountId))
  .setTokenIds(['0.0.429274'])
  .freezeWith(client)
  .sign(merchantKey);
const assocResp = await assoc.execute(client);
const assocRec = await assocResp.getRecord(client);
console.log('usdc associate:', assocRec.receipt.status.toString());

