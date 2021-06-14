import { PublicKey } from '@solana/web3.js';

export class Staking {
    programId: PublicKey;

    constructor(programId: PublicKey) {
        this.programId = programId;
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
