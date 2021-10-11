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

    public nextEmissionChange: Date;
    public emission: BN;

    public totalStake: BN;
    public rewardPerShare: BN;
    public lastReward: Date;

    constructor(params: {
        token: PublicKey;
        unbondingTime: BN;
        nextEmissionChange: Date;
        emission: BN;
        totalStake: BN;
        rewardPerShare: BN;
        lastReward: Date;
    }) {
        this.token = params.token;
        this.unbondingTime = params.unbondingTime;
        this.nextEmissionChange = params.nextEmissionChange;
        this.emission = params.emission;
        this.totalStake = params.totalStake;
        this.rewardPerShare = params.rewardPerShare;
        this.lastReward = params.lastReward;
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

    constructor(params: {
        authority: PublicKey;
        staked: BN;
        rewardDebt: BN;
        holding: BN;
    }) {
        this.authority = params.authority;
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

export class Endpoint {
    public creationDate: Date;
    public authority: PublicKey;

    public primary: PublicKey;
    public secondary: PublicKey;

    constructor(params: {
        creationDate: Date;
        authority: PublicKey;
        primary: PublicKey;
        secondary: PublicKey;
    }) {
        this.creationDate = params.creationDate;
        this.authority = params.authority;
        this.primary = params.primary;
        this.secondary = params.secondary;
    }
}

export class Stake {
    public creationDate: Date;
    public totalStake: BN;
    public staker: PublicKey;
    public unbondingEnd: Date;
    public unbondingAmount: BN;

    constructor(params: {
        creationDate: Date;
        totalStake: BN;
        staker: PublicKey;
        unbondingEnd: Date;
        unbondingAmount: BN;
    }) {
        this.creationDate = params.creationDate;
        this.totalStake = params.totalStake;
        this.staker = params.staker;
        this.unbondingEnd = params.unbondingEnd;
        this.unbondingAmount = params.unbondingAmount;
    }
}

export const ACCOUNT_SCHEMA: borsh.Schema = new Map<any, any>([
    [
        Settings,
        {
            kind: 'struct',
            fields: [
                ['token', 'PublicKey'],
                ['unbondingTime', 'u64'],
                ['nextEmissionChange', 'Date'],
                ['emission', 'u64'],

                ['totalStake', 'u64'],
                ['rewardPerShare', 'u128'],
                ['lastReward', 'Date']
            ]
        }
    ],
    [
        Beneficiary,
        {
            kind: 'struct',
            fields: [
                ['authority', 'PublicKey'],
                ['staked', 'u64'],
                ['rewardDebt', 'u64'],
                ['holding', 'u64']
            ]
        }
    ],
    [
        Endpoint,
        {
            kind: 'struct',
            fields: [
                ['creationDate', 'Date'],
                ['authority', 'PublicKey'],
                ['primary', 'PublicKey'],
                ['secondary', 'PublicKey']
            ]
        }
    ],
    [
        Stake,
        {
            kind: 'struct',
            fields: [
                ['creationDate', 'Date'],
                ['totalStake', 'u64'],
                ['staker', 'PublicKey'],
                ['unbondingEnd', 'Date'],
                ['unbondingAmount', 'u64']
            ]
        }
    ]
]);
