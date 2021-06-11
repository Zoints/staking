import * as BN from 'bn.js';
import { Schema } from 'borsh';

export class Initialize {
    instructionId: number = 0;

    static schema: Schema = new Map([
        [
            Initialize,
            {
                kind: 'struct',
                fields: [['instructionId', 'u8']]
            }
        ]
    ]);

    constructor() {}
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

export class Stake {
    instructionId: number = 3;
    amount: number;

    static schema: Schema = new Map([
        [
            Stake,
            {
                kind: 'struct',
                fields: [
                    ['instructionId', 'u8'],
                    ['amount', 'u64']
                ]
            }
        ]
    ]);

    constructor(amount: number) {
        this.amount = amount;
    }
}
