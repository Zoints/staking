import { Connection, PublicKey } from '@solana/web3.js';
import { ACCOUNT_SCHEMA, Beneficiary, Endpoint, Settings } from './';
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

        return borsh.deserialize(ACCOUNT_SCHEMA, Settings, account.data);
    }

    public async getEndpoint(endpointId: PublicKey): Promise<Endpoint> {
        const account = await this.connection.getAccountInfo(endpointId);
        if (account === null)
            throw new Error('Unable to find endpoint account');
        if (!account.owner.equals(this.programId))
            throw new Error('Not a recognized endpoint account');
        return borsh.deserialize(ACCOUNT_SCHEMA, Endpoint, account.data);
    }

    public async getStakeWithoutId(
        endpointId: PublicKey,
        owner: PublicKey
    ): Promise<Stake> {
        const stakeId = await Staking.stakeAddress(
            this.programId,
            endpointId,
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
        endpoint: PublicKey,
        staker: PublicKey
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('stake'), endpoint.toBuffer(), staker.toBuffer()],
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
        endpoint: PublicKey,
        staker: PublicKey,
        programId: PublicKey
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [
                    Buffer.from('stake fund'),
                    endpoint.toBuffer(),
                    staker.toBuffer()
                ],
                programId
            )
        )[0];
    }
}
