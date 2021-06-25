import { Connection, PublicKey } from '@solana/web3.js';
import { Community, Settings } from './';
import * as borsh from 'borsh';
import { Staker } from './accounts';

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

    public async getStaker(
        communityId: PublicKey,
        owner: PublicKey
    ): Promise<Staker> {
        const stakerId = await Staking.stakerAddress(
            this.programId,
            communityId,
            owner
        );
        return this.getStake(stakerId);
    }

    public async getStake(stakerId: PublicKey): Promise<Staker> {
        const account = await this.connection.getAccountInfo(stakerId);
        if (account === null) throw new Error('Unable to find staker account');

        return borsh.deserialize(Staker.schema, Staker, account.data);
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

    static async stakerAddress(
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
