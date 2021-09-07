import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import * as borsh from 'borsh';
import { PRECISION, SECONDS_PER_YEAR } from '.';

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
    public unbondingTime: BN;
    public feeRecipient: PublicKey;

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
                    ['unbondingTime', 'u64'],
                    ['feeRecipient', [32]],
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
        unbondingTime: BN;
        feeRecipient: Uint8Array;
        nextEmissionChange: BN;
        emission: BN;
        totalStake: BN;
        rewardPerShare: BN;
        lastReward: BN;
    }) {
        this.token = new PublicKey(params.token);
        this.unbondingTime = params.unbondingTime;
        this.feeRecipient = new PublicKey(params.feeRecipient);
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
            const delta = new BN(0);
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

export class Beneficiary {
    public authority: PublicKey;
    public staked: BN;
    public rewardDebt: BN;
    public holding: BN;

    static schema: borsh.Schema = new Map([
        [
            Beneficiary,
            {
                kind: 'struct',
                fields: [
                    ['authority', [32]],
                    ['staked', 'u64'],
                    ['rewardDebt', 'u64'],
                    ['holding', 'u64']
                ]
            }
        ]
    ]);

    constructor(params: {
        authority: Uint8Array;
        staked: BN;
        rewardDebt: BN;
        holding: BN;
    }) {
        this.authority = new PublicKey(params.authority);
        this.staked = params.staked;
        this.rewardDebt = params.rewardDebt;
        this.holding = params.holding;
    }

    public calculateReward(newRewardPerShare: BN): BN {
        return this.staked
            .mul(newRewardPerShare)
            .div(PRECISION)
            .sub(this.rewardDebt);
    }

    public isEmpty(): boolean {
        return this.authority.equals(PublicKey.default);
    }
}

export class Community {
    public creationDate: Date;
    public authority: PublicKey;

    public primary: PublicKey;
    public secondary: PublicKey;

    static schema: borsh.Schema = new Map([
        [
            Community,
            {
                kind: 'struct',
                fields: [
                    ['creationDate', 'u64'],
                    ['authority', [32]],
                    ['primary', [32]],
                    ['secondary', [32]]
                ]
            }
        ]
    ]);

    constructor(params: {
        creationDate: BN;
        authority: Uint8Array;
        primary: Uint8Array;
        secondary: Uint8Array;
    }) {
        this.creationDate = new Date(params.creationDate.toNumber() * 1000);
        this.authority = new PublicKey(params.authority);
        this.primary = new PublicKey(params.primary);
        this.secondary = new PublicKey(params.secondary);
    }
}

export class Stake {
    public creationDate: Date;
    public totalStake: BN;
    public staker: PublicKey;
    public unbondingEnd: Date;
    public unbondingAmount: BN;

    static schema: borsh.Schema = new Map([
        [
            Stake,
            {
                kind: 'struct',
                fields: [
                    ['creationDate', 'u64'],
                    ['totalStake', 'u64'],
                    ['staker', [32]],
                    ['unbondingEnd', 'u64'],
                    ['unbondingAmount', 'u64']
                ]
            }
        ]
    ]);

    constructor(params: {
        creationDate: BN;
        totalStake: BN;
        staker: Uint8Array;
        unbondingEnd: BN;
        unbondingAmount: BN;
    }) {
        this.creationDate = new Date(params.creationDate.toNumber() * 1000);
        this.totalStake = params.totalStake;
        this.staker = new PublicKey(params.staker);
        this.unbondingAmount = params.unbondingAmount;
        this.unbondingEnd = new Date(params.unbondingEnd.toNumber() * 1000);
    }
}
