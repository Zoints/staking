import { expect } from 'chai';
import 'mocha';
import { extractErrorId, parseError } from '../src';

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

        expect(extractErrorId(new Error('something without a code'))).to.eql(
            -1
        );
        expect(extractErrorId(new Error('custom program error: 0x0'))).to.eql(
            0
        );
        expect(
            extractErrorId(
                new Error(
                    'failed to send transaction: Transaction simulation failed: Error processing Instruction 1: custom program error: 0x11'
                )
            )
        ).to.eql(17);
    });
});
