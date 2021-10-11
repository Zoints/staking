import { expect } from 'chai';
import 'mocha';
import * as borsh from 'borsh';
import {
    AmountSchema,
    decodeInstructionData,
    InitSchema,
    Instruction,
    Instructions,
    INSTRUCTION_SCHEMA,
    SimpleSchema
} from '../src';
import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

const programId = new PublicKey('A7PR2hfpVDsBqd83mD6WSEr9Z9CvDNJ9FehcvvLdvuC2');
const funder = new PublicKey('F5AeZLFDdEnAPtfxHMKLTzNYNa9kLvGPM9b8dJzWpHGZ');
const mint = new PublicKey('Q2P36HbwEBwxTSj8QhiMscbA21vBi7edJKbsb9KjBRM');

describe('Serialization', () => {
    it('Initialize', async () => {
        const instruction = await Instruction.Initialize(
            programId,
            funder,
            mint,
            new Date('2021-07-02 08:45:51.000+00'),
            60
        );

        expect(instruction.programId).to.eql(programId);
        expect(instruction.keys).to.be.length(10);

        const data = Buffer.from(
            borsh.serialize(
                INSTRUCTION_SCHEMA,
                new InitSchema({
                    instructionId: Instructions.Initialize,
                    startTime: new Date('2021-07-02 08:45:51.000+00'),
                    unbondingDuration: new BN(60)
                })
            )
        );

        expect(instruction.data).to.be.eql(data);
    });

    it('batching initialize + stake', async () => {
        const community = new PublicKey(
            '2VqNb6Y1CmrZefiVL2shgudkxrTF9VuqDteqwV8jJ7D5'
        );
        const staker = new PublicKey(
            'Svg3TsfzMNY8HbJzAYbVhGXeTJFwFfWbVirJSfyqPxd'
        );
        const assoc = new PublicKey(
            '8G9cBnmyqH2sQDqdUjEk5T4dpUTXaUqCkWEKgY4GJv1B'
        );

        const primary = new PublicKey(
            '2bvn5d4krBDdCXEMH9KKHPx8xGauv6wEsaPZWAyYnUJh'
        );
        const secondary = new PublicKey(
            '73aD1aXy4Z1arEYHCVxefmZHm4PgHTY7fxXTD34bSirf'
        );

        const tx = new Transaction()
            .add(
                await Instruction.InitializeStake(
                    programId,
                    funder,
                    staker,
                    community,
                    mint
                )
            )
            .add(
                await Instruction.Stake(
                    programId,
                    funder,
                    staker,
                    assoc,
                    community,
                    primary,
                    secondary,
                    666n
                )
            );
        tx.feePayer = funder;
        tx.recentBlockhash = '11111111111111111111111111111111';

        const data = tx.serialize({ verifySignatures: false });
        const tx2 = Transaction.from(data);

        expect(tx).to.eql(tx2);
    });

    it('batching claim + withdraw', async () => {
        const community = new PublicKey(
            '2VqNb6Y1CmrZefiVL2shgudkxrTF9VuqDteqwV8jJ7D5'
        );
        const staker = new PublicKey(
            'Svg3TsfzMNY8HbJzAYbVhGXeTJFwFfWbVirJSfyqPxd'
        );
        const assoc = new PublicKey(
            '8G9cBnmyqH2sQDqdUjEk5T4dpUTXaUqCkWEKgY4GJv1B'
        );

        let tx = new Transaction()
            .add(await Instruction.Claim(programId, funder, staker, assoc))
            .add(
                await Instruction.WithdrawUnbond(
                    programId,
                    funder,
                    staker,
                    assoc,
                    community
                )
            );
        tx.feePayer = funder;
        tx.recentBlockhash = '11111111111111111111111111111111';

        tx = Transaction.from(tx.serialize({ verifySignatures: false })); // requires transformation

        const data = tx.serialize({ verifySignatures: false });
        const tx2 = Transaction.from(data);

        expect(tx).to.eql(tx2);
    });

    it('decode unknown initialize instruction data', async () => {
        const init = new InitSchema({
            instructionId: Instructions.Initialize, // only this uses init schema
            startTime: new Date('2021-07-02 08:45:51.000+00'),
            unbondingDuration: new BN(60)
        });

        const data = Buffer.from(borsh.serialize(INSTRUCTION_SCHEMA, init));

        const reverse = decodeInstructionData(data);
        expect(reverse.instructionId).to.be.eql(init.instructionId);
        expect((reverse as InitSchema).startTime).to.be.eql(init.startTime);
        expect(
            (reverse as InitSchema).unbondingDuration.eq(init.unbondingDuration)
        ).to.be.true;
    });

    it('decode unknown amount instruction data', async () => {
        const init = new AmountSchema({
            instructionId: Instructions.Stake, // only this uses amount schema
            amount: 1234234n
        });

        const data = Buffer.from(borsh.serialize(INSTRUCTION_SCHEMA, init));
        const reverse = decodeInstructionData(data);
        expect(reverse).to.be.eql(init);
    });

    it('decode unknown simple instruction data', async () => {
        const init = new SimpleSchema({
            instructionId: Instructions.RegisterEndpoint // uses simple schema
        });

        const data = Buffer.from(borsh.serialize(INSTRUCTION_SCHEMA, init));
        const reverse = decodeInstructionData(data);
        expect(reverse).to.be.eql(init);
    });
});
