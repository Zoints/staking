import { Connection, PublicKey } from '@solana/web3.js';
import { Community, Settings } from './';
import * as borsh from 'borsh';
import { Stake } from './accounts';

export class Staking {
    programId: PublicKey;
    connection: Connection;

    constructor(programId: PublicKey, connection: Connection) {
        this.programId = programId;
        this.connection = connection;
    }

    public async getSettings(): Promise<Settings> {
        const settingsId = await Staking.settingsId(this.programId);
        const account = await this.connection.getAccountInfo(settingsId);
        if (account === null)
            throw new Error('Unable to find settings account');

        return borsh.deserialize(Settings.schema, Settings, account.data);
    }

    public async getCommunity(communityId: PublicKey): Promise<Community> {
        const account = await this.connection.getAccountInfo(communityId);
        if (account === null)
            throw new Error('Unable to find community account');
        if (!account.owner.equals(this.programId))
            throw new Error('Not a recognized community account');
        return borsh.deserialize(Community.schema, Community, account.data);
    }

    public async getStakeWithoutId(
        communityId: PublicKey,
        owner: PublicKey
    ): Promise<Stake> {
        const stakeId = await Staking.stakeAddress(
            this.programId,
            communityId,
            owner
        );
        return this.getStake(stakeId);
    }

    public async getStake(stakeId: PublicKey): Promise<Stake> {
        const account = await this.connection.getAccountInfo(stakeId);
        if (account === null) throw new Error('Unable to find staker account');

        return borsh.deserialize(Stake.schema, Stake, account.data);
    }

    static async settingsId(programId: PublicKey): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('settings')],
                programId
            )
        )[0];
    }

    static async poolAuthorityId(programId: PublicKey): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('poolauthority')],
                programId
            )
        )[0];
    }

    async poolAuthorityId(): Promise<PublicKey> {
        return Staking.poolAuthorityId(this.programId);
    }

    static async rewardPoolId(programId: PublicKey): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('rewardpool')],
                programId
            )
        )[0];
    }

    async rewardPoolId(): Promise<PublicKey> {
        return Staking.rewardPoolId(this.programId);
    }

    static async stakePoolId(programId: PublicKey): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('stakepool')],
                programId
            )
        )[0];
    }

    async stakePoolId(): Promise<PublicKey> {
        return Staking.stakePoolId(this.programId);
    }

    static async stakeAddress(
        programId: PublicKey,
        community: PublicKey,
        owner: PublicKey
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('staker'), community.toBuffer(), owner.toBuffer()],
                programId
            )
        )[0];
    }
}
