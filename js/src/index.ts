import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export * from './staking';
export * from './instruction';
export * from './accounts';

export const ZERO_KEY = new PublicKey(Buffer.alloc(0, 32));
export const PRECISION = new BN('DE0B6B3A7640000', 'hex', 'le'); // 1,000,000,000,000,000,000
export const MINIMUM_STAKE = 1_000;
export const REWARD_PER_HOUR = 5_000;
