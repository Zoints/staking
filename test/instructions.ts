import * as BN from 'bn.js';
import { Schema } from 'borsh';

export class Initialize {
    instructionId: number = 0;
    sponsorFee: number;

    static schema: Schema = new Map([
        [
            Initialize,
            {
                kind: 'struct',
                fields: [
                    ['instructionId', 'u8'],
                    ['sponsorFee', 'u64']
                ]
            }
        ]
    ]);

    constructor(sponsorFee: number) {
        this.sponsorFee = sponsorFee;
    }
}

export class RegisterCommunity {
    instructionId: number = 1;

    static schema: Schema = new Map([
        [
            RegisterCommunity,
            {
                kind: 'struct',
                fields: [['instructionId', 'u8']]
            }
        ]
    ]);

    constructor() {}
}
