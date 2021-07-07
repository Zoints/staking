import { PublicKey } from '@solana/web3.js';
import { App, Claims } from './app';
import { AppCommunity, AppStaker } from './community';

export interface StakeEngine {
    registerCommunity(
        app: App,
        community: AppCommunity,
        noSecondary: boolean
    ): Promise<void>;
    claim(app: App, claim: Claims, community?: AppCommunity): Promise<void>;
    stake(
        app: App,
        community: AppCommunity,
        staker: AppStaker,
        amount: number
    ): Promise<void>;
    withdraw(
        app: App,
        community: AppCommunity,
        staker: AppStaker
    ): Promise<void>;
}
