import { Connection, PublicKey } from '@solana/web3.js';
import { Settings } from './accounts';
import * as borsh from 'borsh';

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
        if (account === null) throw new Error('Unable to find settings account');

        return borsh.deserialize(Settings.schema, Settings, account.data);
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
    static async rewardPoolId(programId: PublicKey): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('rewardpool')],
                programId
            )
        )[0];
    }
    static async stakePoolId(programId: PublicKey): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('stakepool')],
                programId
            )
        )[0];
    }

    static async stakeAddress(
        programId: PublicKey,
        community: PublicKey,
        owner: PublicKey
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [Buffer.from('stake'), community.toBuffer(), owner.toBuffer()],
                programId
            )
        )[0];
    }
}
