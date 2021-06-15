import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import * as borsh from 'borsh';

export class Settings {
    token: PublicKey;
    authority: PublicKey;

    totalStake: BN;
    rewardPerShare: BN;
    lastReward: BN;

    static schema: borsh.Schema = new Map([
        [
            Settings,
            {
                kind: 'struct',
                fields: [
                    ['token', [32]],
                    ['authority', [32]],
                    ['totalStake', 'u64'],
                    ['rewardPerShare', 'u256'],
                    ['lastReward', 'u64'] // this is an i64 timestamp, so always > 0, u64 should be fine
                ]
            }
        ]
    ]);

    constructor(params: {
        token: PublicKey;
        authority: PublicKey;
        totalStake: BN;
        rewardPerShare: BN;
        lastReward: BN;
    }) {
        this.token = params.token;
        this.authority = params.authority;
        this.totalStake = params.totalStake;
        this.rewardPerShare = params.rewardPerShare;
        this.lastReward = params.lastReward;
    }
}
