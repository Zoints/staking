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
                fields: [['token', [32]], ['authority', [32]], ['totalStake', 'u64'], ['rewardPerShare', 'u256'], ['lastReward', 'i64']]
            }
        ]
    ]);

    constructor(token: PublicKey, authority: PublicKey, totalStake: BN, rewardPerShare: BN, lastReward: BN) {
        this.token = token;
        this.authority = authority;
        this.totalStake = totalStake;
        this.rewardPerShare = rewardPerShare;
        this.lastReward = lastReward;
    }
}