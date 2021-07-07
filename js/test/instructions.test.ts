import { expect } from 'chai';
import 'mocha';
import * as borsh from 'borsh';
import { InitSchema, Instruction, Instructions } from '../src';
import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

const programId = new PublicKey('A7PR2hfpVDsBqd83mD6WSEr9Z9CvDNJ9FehcvvLdvuC2');
const funder = new PublicKey('F5AeZLFDdEnAPtfxHMKLTzNYNa9kLvGPM9b8dJzWpHGZ');
const mint = new PublicKey('Q2P36HbwEBwxTSj8QhiMscbA21vBi7edJKbsb9KjBRM');
const fee = new PublicKey('11111111111111111111111111111111');

describe('Serialization', () => {
    it('Initialize', async () => {
        const instruction = await Instruction.Initialize(
            programId,
            funder,
            fee,
            mint,
            new Date('2021-07-02 08:45:51.000+00'),
            60
        );

        expect(instruction.programId).to.eql(programId);
        expect(instruction.keys).to.be.length(9);

        const data = Buffer.from(
            borsh.serialize(
                InitSchema.schema,
                new InitSchema(
                    Instructions.Initialize,
                    BigInt(
                        new Date('2021-07-02 08:45:51.000+00').getUnixTime()
                    ),
                    new BN(60)
                )
            )
        );

        expect(instruction.data).to.be.eql(data);
    });

    it('batching', async () => {
        const community = new PublicKey(
            '2VqNb6Y1CmrZefiVL2shgudkxrTF9VuqDteqwV8jJ7D5'
        );
        const owner = new PublicKey(
            'Svg3TsfzMNY8HbJzAYbVhGXeTJFwFfWbVirJSfyqPxd'
        );
        const assoc = new PublicKey(
            '8G9cBnmyqH2sQDqdUjEk5T4dpUTXaUqCkWEKgY4GJv1B'
        );

        const tx = new Transaction()
            .add(
                await Instruction.InitializeStake(
                    programId,
                    funder,
                    owner,
                    community
                )
            )
            .add(
                await Instruction.Stake(
                    programId,
                    funder,
                    owner,
                    assoc,
                    community,
                    mint,
                    666
                )
            );
        tx.feePayer = funder;
        tx.recentBlockhash = '11111111111111111111111111111111';

        const data = tx.serialize({ verifySignatures: false });
        const tx2 = Transaction.from(data);

        expect(tx).to.eql(tx2);
    });
});
