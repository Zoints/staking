import { expect } from 'chai';
import 'mocha';
import * as borsh from 'borsh';
import {
    AmountSchema,
    InitSchema,
    Instruction,
    Instructions,
    INSTRUCTION_SCHEMA
} from '../src';
import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

describe('borsh extensions', () => {
    it('check if negative bigint works', async () => {
        const amount = -298347345356456n;

        const data = Buffer.from(
            borsh.serialize(
                INSTRUCTION_SCHEMA,
                new AmountSchema({
                    id: Instructions.Stake,
                    amount: amount
                })
            )
        );

        const reverse = borsh.deserialize(
            INSTRUCTION_SCHEMA,
            AmountSchema,
            data
        );

        expect(reverse.amount).to.be.eql(amount);
    });
});
