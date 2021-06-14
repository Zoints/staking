import { PublicKey } from '@solana/web3.js';

export * from './staking';
export * from './instruction';

export const ZERO_KEY = new PublicKey(Buffer.alloc(0, 32));
