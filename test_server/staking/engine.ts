import { Keypair } from '@solana/web3.js';
import { App } from './app';
import { AppCommunity, AppStaker } from './community';

export interface StakeEngine {
    registerCommunity(
        app: App,
        community: AppCommunity,
        noSecondary: boolean
    ): Promise<void>;
    claim(
        app: App,
        authority: Keypair,
        communities?: AppCommunity[]
    ): Promise<void>;
    stake(
        app: App,
        community: AppCommunity,
        staker: AppStaker,
        amount: bigint
    ): Promise<void>;
    withdraw(
        app: App,
        staker: AppStaker,
        communities: AppCommunity[]
    ): Promise<void>;
}
