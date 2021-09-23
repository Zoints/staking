import { Connection, PublicKey } from '@solana/web3.js';
import { ACCOUNT_SCHEMA, Beneficiary, Community, Settings } from './';
import * as borsh from 'borsh';
import { Stake } from './accounts';

export class Staking {
    programId: PublicKey;
    connection: Connection;
    feeRecipient: PublicKey | undefined;

    constructor(programId: PublicKey, connection: Connection) {
        this.programId = programId;
        this.connection = connection;
    }

    public async getSettings(): Promise<Settings> {
        const settingsId = await Staking.settingsId(this.programId);
        const account = await this.connection.getAccountInfo(settingsId);
        if (account === null)
            throw new Error('Unable to find settings account');

        return borsh.deserialize(ACCOUNT_SCHEMA, Settings, account.data);
    }

    public async getFeeRecipient(): Promise<PublicKey> {
        if (this.feeRecipient === undefined) {
            const settings = await this.getSettings();
            this.feeRecipient = settings.feeRecipient;
        }
        return this.feeRecipient;
    }

    public async getCommunity(communityId: PublicKey): Promise<Community> {
        const account = await this.connection.getAccountInfo(communityId);
        if (account === null)
            throw new Error('Unable to find community account');
        if (!account.owner.equals(this.programId))
            throw new Error('Not a recognized community account');
        return borsh.deserialize(ACCOUNT_SCHEMA, Community, account.data);
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

    static async beneficiary(
        authority: PublicKey,
        programId: PublicKey
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('beneficiary'), authority.toBuffer()],
                programId
            )
        )[0];
    }

    public async getBeneficiary(authority: PublicKey): Promise<Beneficiary> {
        const beneficiaryId = await Staking.beneficiary(
            authority,
            this.programId
        );
        const account = await this.connection.getAccountInfo(beneficiaryId);
        if (account === null)
            throw new Error('Unable to find beneficiary account');

        return borsh.deserialize(ACCOUNT_SCHEMA, Beneficiary, account.data);
    }

    static async stakeAddress(
        programId: PublicKey,
        community: PublicKey,
        staker: PublicKey
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('stake'), community.toBuffer(), staker.toBuffer()],
                programId
            )
        )[0];
    }

    public async getStake(stakeId: PublicKey): Promise<Stake> {
        const account = await this.connection.getAccountInfo(stakeId);
        if (account === null) throw new Error('Unable to find stake account');

        return borsh.deserialize(ACCOUNT_SCHEMA, Stake, account.data);
    }

    static async stakeFundAddress(
        community: PublicKey,
        staker: PublicKey,
        programId: PublicKey
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [
                    Buffer.from('stake fund'),
                    community.toBuffer(),
                    staker.toBuffer()
                ],
                programId
            )
        )[0];
    }
}
