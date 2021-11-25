import { expect } from 'chai';
import 'mocha';
import { extractErrorId, parseError, StakingErrors } from '../src';

describe('Errors', () => {
    it('should be equal', () => {
        expect(
            parseError(
                new Error(
                    'failed to send transaction: Transaction simulation failed: Error processing Instruction 1: custom program error: 0x12'
                )
            ).message
        ).to.eql(
            'failed to send transaction: Transaction simulation failed: Error processing Instruction 1: STAKING-ERROR 0x12: StakerMinimumBalanceNotMet'
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
        expect(extractErrorId(new Error('custom program error: 0x09'))).to.eql(
            9
        );
        expect(
            extractErrorId(
                new Error(
                    'failed to send transaction: Transaction simulation failed: Error processing Instruction 1: custom program error: 0x11'
                )
            )
        ).to.eql(17);

        for (
            let i = 0;
            i < StakingErrors.SecondaryAuthorityKeysDoNotMatch;
            i++
        ) {
            expect(
                parseError(
                    new Error(
                        `custom program error: 0x${Buffer.from([i]).toString(
                            'hex'
                        )}`
                    )
                ).message
            ).to.contain(StakingErrors[i]);
        }
    });
});
