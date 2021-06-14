import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    AccountMeta,
    PublicKey,
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction
} from '@solana/web3.js';
import { Staking } from './';
import * as borsh from 'borsh';

export enum Instructions {
    Initialize,
    RegisterCommunity,
    InitializeStake,
    Stake,
    Unstake,
    WithdrawUnbond,
    ClaimPrimary,
    ClaimSecondary
}

export class SimpleSchema {
    instructionId: number;

    static schema: borsh.Schema = new Map([
        [
            SimpleSchema,
            {
                kind: 'struct',
                fields: [['instructionId', 'u8']]
            }
        ]
    ]);

    constructor(id: number) {
        this.instructionId = id;
    }
}

export class AmountSchema {
    instructionId: number;
    amount: number;

    static schema: borsh.Schema = new Map([
        [
            AmountSchema,
            {
                kind: 'struct',
                fields: [
                    ['instructionId', 'u8'],
                    ['amount', 'u64']
                ]
            }
        ]
    ]);

    constructor(id: number, amount: number) {
        this.instructionId = id;
        this.amount = amount;
    }
}

export async function Initialize(
    funder: PublicKey,
    authority: PublicKey,
    mint: PublicKey,
    programId: PublicKey
): Promise<TransactionInstruction> {
    const settingsId = await Staking.settingsId(programId);
    const poolAuthorityId = await Staking.poolAuthorityId(programId);
    const stakePoolId = await Staking.stakePoolId(programId);
    const rewardPoolId = await Staking.rewardPoolId(programId);

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(authority, true, false),
        am(settingsId, false, true),
        am(poolAuthorityId, false, false),
        am(stakePoolId, false, true),
        am(rewardPoolId, false, true),
        am(mint, false, false),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(TOKEN_PROGRAM_ID, false, false),
        am(SystemProgram.programId, false, false)
    ];

    const simple = new SimpleSchema(Instructions.Initialize);
    const data = borsh.serialize(SimpleSchema.schema, simple);

    return new TransactionInstruction({
        keys: keys,
        programId,
        data: Buffer.from(data)
    });
}

function am(
    pubkey: PublicKey,
    isSigner: boolean,
    isWritable: boolean
): AccountMeta {
    return { pubkey, isSigner, isWritable };
}
