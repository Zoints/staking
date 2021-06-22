import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import * as borsh from 'borsh';
import { PRECISION, REWARD_PER_YEAR, SECONDS_PER_YEAR, ZERO_KEY } from '.';

declare global {
    interface Date {
        getUnixTime(): number;
    }
}

Date.prototype.getUnixTime = function (): number {
    return Math.floor(this.getTime() / 1000);
};

export class Settings {
    public token: PublicKey;
    public authority: PublicKey;
    public unbondingTime: BN;

    public nextEmissionChange: Date;
    public emission: BN;

    public totalStake: BN;
    public rewardPerShare: BN;
    public lastReward: Date;

    static schema: borsh.Schema = new Map([
        [
            Settings,
            {
                kind: 'struct',
                fields: [
                    ['token', [32]],
                    ['authority', [32]],
                    ['unbondingTime', 'u64'],
                    ['nextEmissionChange', 'u64'], // this is an i64 timestamp, so always > 0, u64 should be fine
                    ['emission', 'u64'],

                    ['totalStake', 'u64'],
                    ['rewardPerShare', 'u128'],
                    ['lastReward', 'u64'] // this is an i64 timestamp, so always > 0, u64 should be fine
                ]
            }
        ]
    ]);

    constructor(params: {
        token: Uint8Array;
        authority: Uint8Array;
        unbondingTime: BN;
        nextEmissionChange: BN;
        emission: BN;
        totalStake: BN;
        rewardPerShare: BN;
        lastReward: BN;
    }) {
        this.token = new PublicKey(params.token);
        this.authority = new PublicKey(params.authority);
        this.unbondingTime = params.unbondingTime;
        this.nextEmissionChange = new Date(
            params.nextEmissionChange.toNumber() * 1000
        );
        this.emission = params.emission;
        this.totalStake = params.totalStake;
        this.rewardPerShare = params.rewardPerShare;
        this.lastReward = new Date(params.lastReward.toNumber() * 1000);
    }

    public calculateRewardPerShare(now: Date): BN {
        let reward = this.rewardPerShare;

        const oldSeconds = this.lastReward.getUnixTime();
        const newSeconds = now.getUnixTime();

        if (newSeconds <= oldSeconds) {
            return reward;
        }

        if (this.totalStake.cmpn(0) > 0) {
            let delta = new BN(0);
            let emission = this.emission;
            let nextEmissionChange = this.nextEmissionChange.getUnixTime();
            let lastReward = this.lastReward.getUnixTime();
            while (newSeconds >= nextEmissionChange) {
                const seconds = new BN(nextEmissionChange - lastReward);
                delta.iadd(
                    PRECISION.mul(emission)
                        .div(SECONDS_PER_YEAR)
                        .div(this.totalStake)
                        .mul(seconds)
                );
                lastReward = nextEmissionChange;
                nextEmissionChange += SECONDS_PER_YEAR.toNumber();
                emission = emission.muln(3).divn(4);
            }

            const seconds = new BN(newSeconds - lastReward);
            delta.iadd(
                PRECISION.mul(emission)
                    .div(SECONDS_PER_YEAR)
                    .div(this.totalStake)
                    .mul(seconds)
            );

            reward = reward.add(delta);
        }

        return reward;
    }
}

class Beneficiary {
    public authority: PublicKey;
    public staked: BN;
    public rewardDebt: BN;
    public pendingReward: BN;

    constructor(params: {
        authority: PublicKey;
        staked: BN;
        rewardDebt: BN;
        pendingReward: BN;
    }) {
        this.authority = params.authority;
        this.staked = params.staked;
        this.rewardDebt = params.rewardDebt;
        this.pendingReward = params.pendingReward;
    }

    public calculateReward(newRewardPerShare: BN): BN {
        return this.staked
            .mul(newRewardPerShare)
            .div(PRECISION)
            .sub(this.rewardDebt);
    }

    public isEmpty(): boolean {
        return this.authority.equals(ZERO_KEY);
    }
}

export class Community {
    public creationDate: Date;
    public authority: PublicKey;

    public primary: Beneficiary;
    public secondary: Beneficiary;

    static schema: borsh.Schema = new Map([
        [
            Community,
            {
                kind: 'struct',
                fields: [
                    ['creationDate', 'u64'],
                    ['authority', [32]],
                    ['primaryAuthority', [32]],
                    ['primaryStaked', 'u64'],
                    ['primaryRewardDebt', 'u64'],
                    ['primaryPendingReward', 'u64'],
                    ['secondaryAuthority', [32]],
                    ['secondaryStaked', 'u64'],
                    ['secondaryRewardDebt', 'u64'],
                    ['secondaryPendingReward', 'u64']
                ]
            }
        ]
    ]);

    constructor(params: {
        creationDate: BN;
        authority: Uint8Array;
        primaryAuthority: Uint8Array;
        primaryStaked: BN;
        primaryRewardDebt: BN;
        primaryPendingReward: BN;
        secondaryAuthority: Uint8Array;
        secondaryStaked: BN;
        secondaryRewardDebt: BN;
        secondaryPendingReward: BN;
    }) {
        this.creationDate = new Date(params.creationDate.toNumber() * 1000);
        this.authority = new PublicKey(params.authority);
        this.primary = new Beneficiary({
            authority: new PublicKey(params.primaryAuthority),
            staked: params.primaryStaked,
            rewardDebt: params.primaryRewardDebt,
            pendingReward: params.primaryPendingReward
        });
        this.secondary = new Beneficiary({
            authority: new PublicKey(params.secondaryAuthority),
            staked: params.secondaryStaked,
            rewardDebt: params.secondaryRewardDebt,
            pendingReward: params.secondaryPendingReward
        });
    }
}

export class Staker {
    public creationDate: Date;
    public totalStake: BN;
    public beneficiary: Beneficiary;
    public unbondingStart: Date;
    public unbondingAmount: BN;

    static schema: borsh.Schema = new Map([
        [
            Staker,
            {
                kind: 'struct',
                fields: [
                    ['creationDate', 'u64'],
                    ['totalStake', 'u64'],
                    ['authority', [32]],
                    ['staked', 'u64'],
                    ['rewardDebt', 'u64'],
                    ['pendingReward', 'u64'],
                    ['unbondingStart', 'u64'],
                    ['unbondingAmount', 'u64']
                ]
            }
        ]
    ]);

    constructor(params: {
        creationDate: BN;
        totalStake: BN;
        authority: Uint8Array;
        staked: BN;
        rewardDebt: BN;
        pendingReward: BN;
        unbondingStart: BN;
        unbondingAmount: BN;
    }) {
        this.creationDate = new Date(params.creationDate.toNumber() * 1000);
        this.totalStake = params.totalStake;
        this.beneficiary = new Beneficiary({
            authority: new PublicKey(params.authority),
            staked: params.staked,
            rewardDebt: params.rewardDebt,
            pendingReward: params.pendingReward
        });
        this.unbondingAmount = params.unbondingAmount;
        this.unbondingStart = new Date(params.unbondingStart.toNumber() * 1000);
    }
}
