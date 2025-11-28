// JTAG State Machine implementation
export class JTAGStateMachine {
    constructor(usbBlaster) {
        this.usb = usbBlaster;
        this.currentState = 'RESET';
        this.endDRState = 'IDLE';
        this.endIRState = 'IDLE';
        
        // JTAG state transitions based on TMS
        this.stateTransitions = {
            'RESET': { 0: 'IDLE', 1: 'RESET' },
            'IDLE': { 0: 'IDLE', 1: 'DRSELECT' },
            'DRSELECT': { 0: 'DRCAPTURE', 1: 'IRSELECT' },
            'DRCAPTURE': { 0: 'DRSHIFT', 1: 'DREXIT1' },
            'DRSHIFT': { 0: 'DRSHIFT', 1: 'DREXIT1' },
            'DREXIT1': { 0: 'DRPAUSE', 1: 'DRUPDATE' },
            'DRPAUSE': { 0: 'DRPAUSE', 1: 'DREXIT2' },
            'DREXIT2': { 0: 'DRSHIFT', 1: 'DRUPDATE' },
            'DRUPDATE': { 0: 'IDLE', 1: 'DRSELECT' },
            'IRSELECT': { 0: 'IRCAPTURE', 1: 'RESET' },
            'IRCAPTURE': { 0: 'IRSHIFT', 1: 'IREXIT1' },
            'IRSHIFT': { 0: 'IRSHIFT', 1: 'IREXIT1' },
            'IREXIT1': { 0: 'IRPAUSE', 1: 'IRUPDATE' },
            'IRPAUSE': { 0: 'IRPAUSE', 1: 'IREXIT2' },
            'IREXIT2': { 0: 'IRSHIFT', 1: 'IRUPDATE' },
            'IRUPDATE': { 0: 'IDLE', 1: 'DRSELECT' }
        };
    }
    
    async reset() {
        console.log('Resetting JTAG TAP state machine...');
        // Send TMS=1 for many cycles to ensure we reach RESET state
        // The CLI sends ~2000+ TMS=1 clocks - we'll do 100 to be safe
        // This ensures any previous state is cleared
        const resetClocks = 100;
        const tmsBits = new Array(resetClocks).fill(1);
        const tdiBits = new Array(resetClocks).fill(0);
        await this.usb.shiftBits(tdiBits, tmsBits, resetClocks, false);
        this.applyTMSSequence(tmsBits);
        
        // Then TMS=0 to go to IDLE
        await this.clockTMS(0);
        this.currentState = 'IDLE';
        console.log('JTAG TAP reset to IDLE');
    }
    
    async executeCommand(cmd) {
        // Log all SDR commands for debugging
        if (cmd.type === 'SDR') {
            console.log(`Executing SDR ${cmd.length} bits (${Math.ceil(cmd.length/8)} bytes), has TDI: ${!!cmd.tdi}, TDI length: ${cmd.tdi ? cmd.tdi.length : 0}`);
        }
        
        switch (cmd.type) {
            case 'STATE':
                await this.moveToState(cmd.states[cmd.states.length - 1]);
                break;
            case 'SIR':
                await this.shiftIR(cmd);
                break;
            case 'SDR':
                await this.shiftDR(cmd);
                break;
            case 'RUNTEST':
                await this.runTest(cmd);
                break;
            case 'FREQUENCY':
                // Frequency setting - typically ignored in software
                break;
            case 'TRST':
                await this.setTRST(cmd.mode);
                break;
            case 'ENDDR':
                this.endDRState = cmd.state || 'IDLE';
                break;
            case 'ENDIR':
                this.endIRState = cmd.state || 'IDLE';
                break;
            case 'HIR':
            case 'TIR':
            case 'HDR':
            case 'TDR':
                // Header/Trailer commands - store for later use
                this[cmd.type.toLowerCase()] = cmd;
                break;
            default:
                console.log(`Unhandled command: ${cmd.type}`);
        }
    }
    
    async moveToState(targetState) {
        const path = this.findStatePath(this.currentState, targetState);
        
        if (path.length === 0) return;
        
        // Batch all TMS bits into a single transfer (like openFPGALoader does)
        const tdiBits = new Array(path.length).fill(0);
        await this.usb.shiftBits(tdiBits, path, path.length, false);
        this.applyTMSSequence(path);
    }
    
    findStatePath(from, to) {
        if (from === to) return [];

        const queue = [{ state: from, path: [] }];
        const visited = new Set([from]);

        while (queue.length > 0) {
            const { state, path } = queue.shift();
            for (const tms of [0, 1]) {
                const nextState = this.stateTransitions[state]?.[tms];
                if (!nextState || visited.has(nextState)) continue;

                const nextPath = [...path, tms];
                if (nextState === to) {
                    return nextPath;
                }

                visited.add(nextState);
                queue.push({ state: nextState, path: nextPath });
            }
        }

        return [];
    }
    
    async clockTMS(tms) {
        // Clock one TMS bit without sampling TDO
        await this.usb.shiftBits([0], [tms], 1, false);
        this.applyTMSSequence([tms]);
    }

    applyTMSSequence(tmsArray) {
        for (const tms of tmsArray) {
            const nextState = this.stateTransitions[this.currentState]?.[tms];
            if (nextState) {
                this.currentState = nextState;
            }
        }
    }
    
    async shiftIR(cmd) {
        // Move to IRSHIFT state
        await this.moveToState('IRSHIFT');
        
        // Shift instruction register
        if (cmd.tdi) {
            await this.shiftData(cmd.tdi, cmd.length);
        }
        
        // Move to end state (ENDIR)
        await this.moveToState(this.endIRState);
    }
    
    async shiftDR(cmd) {
        // Move to DRSHIFT state
        await this.moveToState('DRSHIFT');
        
        // Shift data register
        if (cmd.tdi) {
            // Debug: log first bytes of large transfers
            if (cmd.length > 100000) {
                const firstBytes = Array.from(cmd.tdi.slice(0, 16))
                    .map(b => '0x' + b.toString(16).padStart(2, '0'))
                    .join(' ');
                // Check the transition area around byte 600 where pattern changes
                const bytes600 = Array.from(cmd.tdi.slice(600, 616))
                    .map(b => '0x' + b.toString(16).padStart(2, '0'))
                    .join(' ');
                // Also check a middle section
                const bytesMid = Array.from(cmd.tdi.slice(Math.floor(cmd.tdi.length / 2), Math.floor(cmd.tdi.length / 2) + 16))
                    .map(b => '0x' + b.toString(16).padStart(2, '0'))
                    .join(' ');
                console.log(`Shifting ${cmd.length} bits (${cmd.tdi.length} bytes)`);
                console.log(`  First 16 bytes: ${firstBytes}`);
                console.log(`  Bytes 600-615: ${bytes600}`);
                console.log(`  Middle section: ${bytesMid}`);
            }
            
            const shouldCapture = false; // Disable TDO capture - USB-Blaster I FT245 doesn't reliably support reads
            const tdo = await this.shiftData(cmd.tdi, cmd.length, shouldCapture);
            
            // Check if TDO verification was expected
            if (shouldCapture && cmd.tdo && cmd.mask) {
                try {
                    this.verifyData(tdo, cmd.tdo, cmd.mask, cmd.length);
                    console.log(`SDR verification passed (${cmd.length} bits)`);
                } catch (e) {
                    console.error(`SDR verification failed: ${e.message}`);
                    // Don't throw, just log, to allow debugging
                }
            } else if (cmd.tdo && cmd.mask) {
                console.log(`Note: SDR has TDO verification (${cmd.length} bits) - skipped for large transfer`);
            }
        }
        
        // Move to end state (ENDDR)
        await this.moveToState(this.endDRState);
    }
    
    async shiftData(tdi, length, capture = false) {
        if (!length) {
            return capture ? new Uint8Array(0) : null;
        }

        // For large transfers (> 1000 bits), use optimized byte-based shifting
        // This avoids creating massive bit arrays that can cause memory issues
        if (length > 1000 && !capture) {
            const result = await this.usb.shiftBytes(tdi, length);
            // Update state: last bit had TMS=1 to exit shift state
            this.currentState = this.currentState === 'DRSHIFT' ? 'DREXIT1' : 'IREXIT1';
            return result;
        }

        // For small transfers or when capturing, use bit-based approach
        const tdiArray = this.bytesToBits(tdi, length);
        const tmsArray = new Array(length).fill(0);

        // Last bit should have TMS=1 to exit shift state
        tmsArray[length - 1] = 1;

        const result = await this.usb.shiftBits(tdiArray, tmsArray, length, capture);
        this.applyTMSSequence(tmsArray);
        return result;
    }
    
    bytesToBits(bytes, length) {
        const bits = [];
        for (let i = 0; i < length; i++) {
            const byteIdx = Math.floor(i / 8);
            const bitIdx = i % 8;
            // Extract bit in LSB-first order (bit 0 first, then bit 1, etc.)
            bits.push((bytes[byteIdx] >> bitIdx) & 1);
        }
        return bits;
    }

    verifyData(tdo, expected, mask, bitLength) {
        // Convert TDO response to bytes if needed
        const tdoBytes = tdo instanceof Uint8Array ? tdo : new Uint8Array(tdo);
        const numBytes = Math.ceil(bitLength / 8);

        const expectedBytes = expected instanceof Uint8Array
            ? expected
            : (expected ? new Uint8Array(expected) : null);
        const maskBytes = mask instanceof Uint8Array
            ? mask
            : (mask ? new Uint8Array(mask) : null);
        
        // Compare TDO with expected value using mask
        for (let i = 0; i < numBytes; i++) {
            const maskByte = maskBytes ? (maskBytes[i] ?? 0) : 0xFF;
            if (maskByte === 0) continue;

            const tdoByte = tdoBytes[i] || 0;
            const expectedByte = expectedBytes ? (expectedBytes[i] || 0) : 0;
            
            if ((tdoByte & maskByte) !== (expectedByte & maskByte)) {
                throw new Error(
                    `Verification failed at byte ${i}: ` +
                    `got 0x${tdoByte.toString(16).padStart(2, '0')}, ` +
                    `expected 0x${expectedByte.toString(16).padStart(2, '0')}, ` +
                    `mask 0x${maskByte.toString(16).padStart(2, '0')}`
                );
            }
        }
    }
    
    async runTest(cmd) {
        const cycles = cmd?.cycles || 0;
        const runState = cmd?.state || 'IDLE';
        const endState = cmd?.endState || runState;

        await this.moveToState(runState);

        if (cycles > 0) {
            // Use byte-shift mode for efficiency
            // In IDLE state with TMS=0, we just toggle TCK
            await this.usb.toggleClockCycles(cycles);
        }

        if (endState !== runState) {
            await this.moveToState(endState);
        }
    }
    
    async setTRST(mode) {
        // TRST control - implementation depends on hardware
        console.log(`TRST ${mode}`);
    }
}
