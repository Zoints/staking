import { expect } from 'chai';
import 'mocha';
import { parseError } from '../src';

describe('Errors', () => {
    it('should be equal', () => {
        expect(
            parseError(
                new Error(
                    'failed to send transaction: Transaction simulation failed: Error processing Instruction 1: custom program error: 0x11'
                )
            ).message
        ).to.eql(
            'failed to send transaction: Transaction simulation failed: Error processing Instruction 1: STAKING-ERROR 0x11: StakerMinimumBalanceNotMet'
        );

        expect(
            parseError(new Error('custom program error: 0x0')).message
        ).to.eql('STAKING-ERROR 0x0: MissingAuthoritySignature');
    });
});
