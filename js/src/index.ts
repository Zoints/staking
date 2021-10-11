import BN from 'bn.js';

export * from './staking';
export * from './instruction';
export * from './accounts';
export * from './errors';

export const PRECISION = new BN('1000000000000', 10);
export const MINIMUM_STAKE = 1_000;
export const BASE_REWARD = new BN(900_000_000_000);
export const SECONDS_PER_YEAR = new BN(31_536_000);
