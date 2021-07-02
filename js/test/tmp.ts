import { Keypair } from '@solana/web3.js';

console.log(new Keypair().publicKey.toBase58());
