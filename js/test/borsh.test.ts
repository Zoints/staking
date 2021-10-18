import { expect } from 'chai';
import 'mocha';
import * as borsh from 'borsh';
import {
    AmountSchema,
    Authority,
    AuthorityType,
    Instructions,
    INSTRUCTION_SCHEMA
} from '../src';
import { Keypair, PublicKey } from '@solana/web3.js';

class PKTest {
    key: PublicKey;
    constructor(params: { key: PublicKey }) {
        this.key = params.key;
    }
}
class DateTest {
    date: Date;
    constructor(params: { date: Date }) {
        this.date = params.date;
    }
}
class AuthorityTest {
    authority: Authority;
    constructor(params: { authority: Authority }) {
        this.authority = params.authority;
    }
}

export const TEST_SCHEMA: borsh.Schema = new Map<any, any>([
    [
        PKTest,
        {
            kind: 'struct',
            fields: [['key', 'PublicKey']]
        }
    ],
    [
        DateTest,
        {
            kind: 'struct',
            fields: [['date', 'Date']]
        }
    ],
    [
        AuthorityTest,
        {
            kind: 'struct',
            fields: [['authority', 'Authority']]
        }
    ]
]);

describe('borsh extensions', () => {
    it('check if negative bigint works', async () => {
        const amount = -298347345356456n;

        const data = Buffer.from(
            borsh.serialize(
                INSTRUCTION_SCHEMA,
                new AmountSchema({
                    instructionId: Instructions.Stake,
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

    it('check if pubkey works', () => {
        const key = new PublicKey(
            'A7PR2hfpVDsBqd83mD6WSEr9Z9CvDNJ9FehcvvLdvuC2'
        );
        const data = Buffer.from(
            borsh.serialize(TEST_SCHEMA, new PKTest({ key }))
        );
        const reverse = borsh.deserialize(TEST_SCHEMA, PKTest, data);

        expect(reverse.key).to.be.eql(key);
    });

    it('check if date works', () => {
        const date = new Date();
        date.setMilliseconds(0); // only storing unix timestamp

        const data = Buffer.from(
            borsh.serialize(TEST_SCHEMA, new DateTest({ date }))
        );
        const reverse = borsh.deserialize(TEST_SCHEMA, DateTest, data);

        expect(reverse.date).to.be.eql(date);
    });

    it('check if nft authority works', () => {
        const key = new PublicKey(
            'A7PR2hfpVDsBqd83mD6WSEr9Z9CvDNJ9FehcvvLdvuC2'
        );
        const authority = new Authority({
            authorityType: AuthorityType.NFT,
            address: key
        });

        const authorityTest = new AuthorityTest({ authority });
        const data = Buffer.from(borsh.serialize(TEST_SCHEMA, authorityTest));

        const reverse = borsh.deserialize(TEST_SCHEMA, AuthorityTest, data);

        expect(reverse.authority.authorityType).to.be.eql(AuthorityType.NFT);
        expect(reverse.authority.address).to.be.eql(key);
    });

    it('check if none authority works', () => {
        const authority = new Authority({
            authorityType: AuthorityType.None,
            address: PublicKey.default
        });

        const authorityTest = new AuthorityTest({ authority });
        const data = Buffer.from(borsh.serialize(TEST_SCHEMA, authorityTest));

        expect(data).to.be.eql(Buffer.from([0]));

        const reverse = borsh.deserialize(TEST_SCHEMA, AuthorityTest, data);

        expect(reverse.authority.authorityType).to.be.eql(AuthorityType.None);
        expect(reverse.authority.address).to.be.eql(PublicKey.default);
    });
});
