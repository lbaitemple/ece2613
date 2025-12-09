/**
 * Xilinx JTAG Protocol Implementation - VERSION 2.0 DEBUG
 * Based on openFPGALoader implementation
 * Supports: Artix-7 (XC7A35T), Zynq-7000 (XC7Z007S)
 * 
 * JTAG Instructions for 7-series devices:
 * - IR length: 6 bits
 * - IDCODE: 0x09
 * - CFG_IN: 0x05 (configuration data input)
 * - CFG_OUT: 0x04 (configuration data output)
 * - JPROGRAM: 0x0B (start programming)
 * - JSTART: 0x0C (start configuration)
 * - JSHUTDOWN: 0x0D (shutdown)
 * - BYPASS: 0x3F
 */

export class XilinxJTAG {
    constructor(ftdiDriver) {
        this.ftdi = ftdiDriver;
        this.irLength = 6;  // 7-series IR length
        
        // JTAG Instructions for Xilinx 7-series
        this.IR = {
            EXTEST: 0x26,
            SAMPLE: 0x01,
            USER1: 0x02,
            USER2: 0x03,
            CFG_OUT: 0x04,
            CFG_IN: 0x05,
            USERCODE: 0x08,
            IDCODE: 0x09,
            HIGHZ: 0x0A,
            JPROGRAM: 0x0B,
            JSTART: 0x0C,
            JSHUTDOWN: 0x0D,
            ISC_ENABLE: 0x10,
            ISC_PROGRAM: 0x11,
            ISC_NOOP: 0x14,
            ISC_DISABLE: 0x16,
            BYPASS: 0x3F
        };
        
        // Known device IDs
        this.DEVICE_IDS = {
            0x0362D093: { name: 'XC7A35T', family: 'Artix-7', board: 'Basys 3' },
            0x0362C093: { name: 'XC7A35T', family: 'Artix-7', board: 'Basys 3 (ES)' },
            0x0362F093: { name: 'XC7S50', family: 'Spartan-7', board: 'Boolean Board' },
            0x03727093: { name: 'XC7Z007S', family: 'Zynq-7000', board: 'BlackBoard' },
            0x03722093: { name: 'XC7Z010', family: 'Zynq-7000', board: 'Zynq' },
            0x03731093: { name: 'XC7Z020', family: 'Zynq-7000', board: 'Zynq' },
        };
        
        // JTAG TAP states
        this.STATES = {
            TEST_LOGIC_RESET: 0,
            RUN_TEST_IDLE: 1,
            SELECT_DR_SCAN: 2,
            CAPTURE_DR: 3,
            SHIFT_DR: 4,
            EXIT1_DR: 5,
            PAUSE_DR: 6,
            EXIT2_DR: 7,
            UPDATE_DR: 8,
            SELECT_IR_SCAN: 9,
            CAPTURE_IR: 10,
            SHIFT_IR: 11,
            EXIT1_IR: 12,
            PAUSE_IR: 13,
            EXIT2_IR: 14,
            UPDATE_IR: 15
        };
        
        this.state = this.STATES.TEST_LOGIC_RESET;
        this.currTdi = 0;
    }

    async init() {
        console.log('=== XilinxJTAG VERSION 2.0 DEBUG ===');
        // Reset JTAG TAP
        await this.goTestLogicReset();
        
        // Read device ID
        const idcode = await this.readIDCODE();
        return idcode;
    }

    async goTestLogicReset() {
        // 5+ TMS=1 clocks to reset TAP (openFPGALoader uses 6)
        const tmsData = new Uint8Array([0x3F]);  // 6 bits of TMS=1
        await this.ftdi.writeTMS(tmsData, 6, true);  // flush = true
        this.state = this.STATES.TEST_LOGIC_RESET;
    }

    async setState(targetState) {
        if (this.state === targetState) return;
        
        let tms = 0;
        const tmsSeq = [];
        
        while (this.state !== targetState) {
            switch (this.state) {
                case this.STATES.TEST_LOGIC_RESET:
                    tms = 0;
                    this.state = this.STATES.RUN_TEST_IDLE;
                    break;
                case this.STATES.RUN_TEST_IDLE:
                    if (targetState === this.STATES.RUN_TEST_IDLE) {
                        tms = 0;
                    } else {
                        tms = 1;
                        this.state = this.STATES.SELECT_DR_SCAN;
                    }
                    break;
                case this.STATES.SELECT_DR_SCAN:
                    if ([this.STATES.CAPTURE_DR, this.STATES.SHIFT_DR, 
                         this.STATES.EXIT1_DR, this.STATES.PAUSE_DR,
                         this.STATES.EXIT2_DR, this.STATES.UPDATE_DR].includes(targetState)) {
                        tms = 0;
                        this.state = this.STATES.CAPTURE_DR;
                    } else {
                        tms = 1;
                        this.state = this.STATES.SELECT_IR_SCAN;
                    }
                    break;
                case this.STATES.CAPTURE_DR:
                    if (targetState === this.STATES.SHIFT_DR) {
                        tms = 0;
                        this.state = this.STATES.SHIFT_DR;
                    } else {
                        tms = 1;
                        this.state = this.STATES.EXIT1_DR;
                    }
                    break;
                case this.STATES.SHIFT_DR:
                    tms = 1;
                    this.state = this.STATES.EXIT1_DR;
                    break;
                case this.STATES.EXIT1_DR:
                    if (targetState === this.STATES.PAUSE_DR ||
                        targetState === this.STATES.EXIT2_DR) {
                        tms = 0;
                        this.state = this.STATES.PAUSE_DR;
                    } else {
                        tms = 1;
                        this.state = this.STATES.UPDATE_DR;
                    }
                    break;
                case this.STATES.PAUSE_DR:
                    tms = 1;
                    this.state = this.STATES.EXIT2_DR;
                    break;
                case this.STATES.EXIT2_DR:
                    if (targetState === this.STATES.SHIFT_DR) {
                        tms = 0;
                        this.state = this.STATES.SHIFT_DR;
                    } else {
                        tms = 1;
                        this.state = this.STATES.UPDATE_DR;
                    }
                    break;
                case this.STATES.UPDATE_DR:
                    if (targetState === this.STATES.RUN_TEST_IDLE) {
                        tms = 0;
                        this.state = this.STATES.RUN_TEST_IDLE;
                    } else {
                        tms = 1;
                        this.state = this.STATES.SELECT_DR_SCAN;
                    }
                    break;
                case this.STATES.SELECT_IR_SCAN:
                    if ([this.STATES.CAPTURE_IR, this.STATES.SHIFT_IR,
                         this.STATES.EXIT1_IR, this.STATES.PAUSE_IR,
                         this.STATES.EXIT2_IR, this.STATES.UPDATE_IR].includes(targetState)) {
                        tms = 0;
                        this.state = this.STATES.CAPTURE_IR;
                    } else {
                        tms = 1;
                        this.state = this.STATES.TEST_LOGIC_RESET;
                    }
                    break;
                case this.STATES.CAPTURE_IR:
                    if (targetState === this.STATES.SHIFT_IR) {
                        tms = 0;
                        this.state = this.STATES.SHIFT_IR;
                    } else {
                        tms = 1;
                        this.state = this.STATES.EXIT1_IR;
                    }
                    break;
                case this.STATES.SHIFT_IR:
                    tms = 1;
                    this.state = this.STATES.EXIT1_IR;
                    break;
                case this.STATES.EXIT1_IR:
                    if (targetState === this.STATES.PAUSE_IR ||
                        targetState === this.STATES.EXIT2_IR) {
                        tms = 0;
                        this.state = this.STATES.PAUSE_IR;
                    } else {
                        tms = 1;
                        this.state = this.STATES.UPDATE_IR;
                    }
                    break;
                case this.STATES.PAUSE_IR:
                    tms = 1;
                    this.state = this.STATES.EXIT2_IR;
                    break;
                case this.STATES.EXIT2_IR:
                    if (targetState === this.STATES.SHIFT_IR) {
                        tms = 0;
                        this.state = this.STATES.SHIFT_IR;
                    } else {
                        tms = 1;
                        this.state = this.STATES.UPDATE_IR;
                    }
                    break;
                case this.STATES.UPDATE_IR:
                    if (targetState === this.STATES.RUN_TEST_IDLE) {
                        tms = 0;
                        this.state = this.STATES.RUN_TEST_IDLE;
                    } else {
                        tms = 1;
                        this.state = this.STATES.SELECT_DR_SCAN;
                    }
                    break;
            }
            tmsSeq.push(tms);
        }
        
        if (tmsSeq.length > 0) {
            const tmsData = this._packBits(tmsSeq);
            await this.ftdi.writeTMS(tmsData, tmsSeq.length, true, this.currTdi);  // flush = true
        }
    }
    
    _packBits(bits) {
        const bytes = new Uint8Array(Math.ceil(bits.length / 8));
        for (let i = 0; i < bits.length; i++) {
            if (bits[i]) {
                bytes[Math.floor(i / 8)] |= (1 << (i % 8));
            }
        }
        return bytes;
    }

    async shiftIR(instruction, readBack = false, endState = this.STATES.RUN_TEST_IDLE) {
        console.log(`shiftIR: instruction=0x${instruction.toString(16)}, readBack=${readBack}, endState=${endState}`);
        
        if (this.state !== this.STATES.SHIFT_IR) {
            await this.setState(this.STATES.SHIFT_IR);
        }
        
        const tdi = new Uint8Array([instruction]);
        const tdo = readBack ? new Uint8Array(1) : null;
        
        // Only set TMS=1 on last bit if we need to exit SHIFT_IR
        const lastBitExit = (endState !== this.STATES.SHIFT_IR);
        
        // Shift IR, last bit with TMS=1 to exit (if needed)
        await this.ftdi.writeTDI(tdi, tdo, this.irLength, lastBitExit);
        
        // Update state based on whether we exited
        if (lastBitExit) {
            this.state = this.STATES.EXIT1_IR;
            if (endState !== this.STATES.EXIT1_IR) {
                await this.setState(endState);
            }
        }
        // If endState is SHIFT_IR, we stay in SHIFT_IR
        
        if (readBack) {
            console.log('shiftIR result:', Array.from(tdo).map(b => '0x' + b.toString(16).padStart(2, '0')));
        }
        
        return tdo;
    }

    async shiftDR(tdi, bitLength, readBack = false, endState = this.STATES.RUN_TEST_IDLE) {
        console.log(`shiftDR: ${bitLength} bits, readBack=${readBack}, endState=${endState}`);
        
        if (this.state !== this.STATES.SHIFT_DR) {
            await this.setState(this.STATES.SHIFT_DR);
        }
        
        const tdo = readBack ? new Uint8Array(Math.ceil(bitLength / 8)) : null;
        
        // Only set TMS=1 on last bit if we need to exit SHIFT_DR
        const lastBitExit = (endState !== this.STATES.SHIFT_DR);
        
        // Shift DR
        await this.ftdi.writeTDI(tdi, tdo, bitLength, lastBitExit);
        
        // Update state based on whether we exited
        if (lastBitExit) {
            this.state = this.STATES.EXIT1_DR;
            if (endState !== this.STATES.EXIT1_DR) {
                await this.setState(endState);
            }
        }
        // If endState is SHIFT_DR, we stay in SHIFT_DR
        
        if (readBack) {
            console.log('shiftDR result:', Array.from(tdo).map(b => '0x' + b.toString(16).padStart(2, '0')));
        }
        
        return tdo;
    }

    async toggleClk(count) {
        // Toggle clock in current state
        const tms = (this.state === this.STATES.TEST_LOGIC_RESET) ? 1 : 0;
        await this.ftdi.toggleClk(tms, 0, count);
    }

    async readIDCODE() {
        console.log('Reading IDCODE...');
        
        await this.goTestLogicReset();
        console.log('TAP reset complete, state:', this.state);
        
        await this.setState(this.STATES.RUN_TEST_IDLE);
        console.log('In RUN_TEST_IDLE, state:', this.state);
        
        // Shift IDCODE instruction
        console.log('Shifting IDCODE instruction (0x09)...');
        await this.shiftIR(this.IR.IDCODE);
        console.log('IDCODE instruction shifted, state:', this.state);
        
        // Shift out 32-bit IDCODE
        console.log('Reading 32-bit IDCODE from DR...');
        const idcodeBytes = await this.shiftDR(new Uint8Array(4), 32, true);
        
        console.log('Raw IDCODE bytes:', Array.from(idcodeBytes).map(b => '0x' + b.toString(16).padStart(2, '0')));
        
        const idcode = (idcodeBytes[3] << 24) | (idcodeBytes[2] << 16) | 
                       (idcodeBytes[1] << 8) | idcodeBytes[0];
        
        console.log('IDCODE: 0x' + idcode.toString(16).padStart(8, '0').toUpperCase());
        
        const deviceInfo = this.DEVICE_IDS[idcode];
        return { idcode, ...deviceInfo };
    }

    // ==================== Configuration Methods ====================

    async programSRAM(bitstream, onProgress) {
        console.log('Starting SRAM configuration (openFPGALoader method)...');
        
        // Helper to report progress (0-100%)
        const reportProgress = (percent) => {
            if (onProgress) onProgress(Math.round(percent));
        };
        
        // Bit-reverse the bitstream (Xilinx BIT files need reversal for JTAG)
        reportProgress(1);
        const configData = this.bitReverse(bitstream);
        console.log(`Configuration data: ${configData.length} bytes`);
        reportProgress(2);
        
        // Step 1: Reset TAP
        await this.goTestLogicReset();
        console.log('Step 1: TAP reset complete');
        reportProgress(3);
        
        // Step 2: JPROGRAM instruction to start programming
        console.log('Step 2: JPROGRAM - initiating programming...');
        await this.shiftIR(this.IR.JPROGRAM);
        reportProgress(4);
        
        // Step 3: Poll for INIT high by reading BYPASS status
        console.log('Step 3: Waiting for INIT...');
        let initDone = false;
        for (let retry = 0; retry < 100; retry++) {
            const status = await this.shiftIR(this.IR.BYPASS, true);
            if (status && (status[0] & 0x01)) {
                initDone = true;
                console.log(`INIT detected after ${retry + 1} attempts`);
                break;
            }
            await this.delay(10);
            // Report progress during INIT polling (4% to 8%)
            reportProgress(4 + (retry / 100) * 4);
        }
        reportProgress(8);
        
        if (!initDone) {
            console.warn('Warning: INIT not detected, continuing anyway...');
        }
        
        // Step 4: Wait for configuration memory clear
        console.log('Step 4: Waiting for memory clear...');
        await this.setState(this.STATES.RUN_TEST_IDLE);
        await this.toggleClk(120000);  // 10000 * 12 clocks as in openFPGALoader
        reportProgress(10);
        
        // Step 5: CFG_IN instruction
        console.log('Step 5: Loading CFG_IN instruction...');
        await this.shiftIR(this.IR.CFG_IN);
        reportProgress(11);
        
        // Step 6: Move to SHIFT_DR via SELECT_DR_SCAN (as openFPGALoader does)
        await this.setState(this.STATES.SELECT_DR_SCAN);
        reportProgress(12);
        
        // Step 7: Send configuration data in chunks (12% to 95%)
        console.log('Step 7: Shifting configuration data...');
        const chunkSize = 4096;  // 4KB chunks
        const totalChunks = Math.ceil(configData.length / chunkSize);
        
        for (let i = 0; i < totalChunks; i++) {
            const offset = i * chunkSize;
            const remaining = configData.length - offset;
            const thisChunkSize = Math.min(chunkSize, remaining);
            const chunk = configData.slice(offset, offset + thisChunkSize);
            const isLast = (i === totalChunks - 1);
            
            // For last chunk, end in UPDATE_DR
            const endState = isLast ? this.STATES.UPDATE_DR : this.STATES.SHIFT_DR;
            await this.shiftDR(chunk, chunk.length * 8, false, endState);
            
            // Scale progress from 12% to 95% during data transfer
            const dataProgress = (offset + thisChunkSize) / configData.length;
            const progress = 12 + dataProgress * 83; // 12% to 95%
            reportProgress(progress);
            console.log(`Progress: ${Math.round(progress)}%`);
        }
        
        // Step 8: Return to Run-Test/Idle
        console.log('Step 8: Returning to Run-Test/Idle...');
        await this.setState(this.STATES.RUN_TEST_IDLE);
        reportProgress(96);
        
        // Step 9: JSTART instruction with UPDATE_IR end state
        console.log('Step 9: JSTART - starting configuration...');
        await this.shiftIR(this.IR.JSTART, false, this.STATES.UPDATE_IR);
        reportProgress(97);
        
        // Step 10: Toggle clock for startup sequence
        console.log('Step 10: Running startup sequence...');
        await this.toggleClk(2000);
        reportProgress(98);
        
        // Step 11: Reset TAP - device should now be operational
        console.log('Step 11: Final TAP reset...');
        await this.goTestLogicReset();
        reportProgress(99);
        
        // Step 12: Verify configuration by checking DONE bit
        console.log('Step 12: Verifying configuration...');
        const verifyStatus = await this.shiftIR(this.IR.BYPASS, true);
        const done = verifyStatus ? ((verifyStatus[0] >> 5) & 0x01) : 0;
        
        if (done) {
            console.log('Configuration successful! DONE bit is set.');
        } else {
            console.warn('Warning: DONE bit not set. Configuration may have failed.');
            console.log('Verify status byte:', verifyStatus ? '0x' + verifyStatus[0].toString(16) : 'null');
        }
        
        reportProgress(100);
        
        return true;
    }

    bitReverse(data) {
        // Bit-reverse each byte (Xilinx BIT files are MSB-first, JTAG needs LSB-first)
        const reversed = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            let byte = data[i];
            let rev = 0;
            for (let j = 0; j < 8; j++) {
                rev = (rev << 1) | (byte & 1);
                byte >>= 1;
            }
            reversed[i] = rev;
        }
        return reversed;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== SPI Flash Methods ====================

    async flashSPI(bitstream, onProgress) {
        throw new Error('SPI flash programming requires openFPGALoader. WebUSB SRAM programming is supported.');
    }
}

/**
 * Digilent FTDI Driver with MPSSE JTAG
 * Based on openFPGALoader ftdiJtagMPSSE.cpp implementation
 * Handles USB communication with Digilent boards (Basys 3, etc.)
 */
export class DigilentFTDI {
    constructor() {
        this.device = null;
        this.interfaceNumber = 0;
        this.endpointIn = 1;
        this.endpointOut = 2;
        
        // MPSSE Commands
        this.MPSSE = {
            // Write TMS with TDI (bit 7)
            WRITE_TMS: 0x4B,        // Clock TMS with LSB first, bit mode, -ve edge
            WRITE_TMS_READ: 0x6B,   // Clock TMS with read
            
            // Write/Read TDI/TDO
            WRITE_BYTES_NEG: 0x11,  // Write bytes on -ve clock
            READ_BYTES_NEG: 0x24,   // Read bytes on -ve clock  
            RW_BYTES_NEG: 0x31,     // Read/Write bytes on -ve clock
            WRITE_BITS_NEG: 0x13,   // Write bits on -ve clock
            READ_BITS_NEG: 0x26,    // Read bits on -ve clock
            RW_BITS_NEG: 0x33,      // Read/Write bits on -ve clock
            
            // GPIO
            SET_BITS_LOW: 0x80,
            GET_BITS_LOW: 0x81,
            SET_BITS_HIGH: 0x82,
            GET_BITS_HIGH: 0x83,
            
            // Clock control
            TCK_DIVISOR: 0x86,
            DISABLE_DIV5: 0x8A,
            ENABLE_DIV5: 0x8B,
            DISABLE_ADAPTIVE: 0x97,
            DISABLE_3PHASE: 0x8D,
            
            // Toggle clock commands
            CLOCK_BYTES: 0x8F,      // Clock N*8 bits (no data)
            CLOCK_BITS: 0x8E,       // Clock N bits (no data)
            
            // Buffer control
            SEND_IMMEDIATE: 0x87,
            LOOPBACK_ON: 0x84,
            LOOPBACK_OFF: 0x85,
        };
        
        // MPSSE mode flags
        this.MPSSE_LSB = 0x08;      // LSB first
        this.MPSSE_BITMODE = 0x02;  // Bit mode
        this.MPSSE_DO_WRITE = 0x10; // Enable write
        this.MPSSE_DO_READ = 0x20;  // Enable read
        
        // Buffer for batching commands
        this.buffer = [];
        this.maxBufferSize = 4096;
        
        // Read pending count
        this.readPending = 0;
    }

    async connect() {
        // Request FTDI device
        this.device = await navigator.usb.requestDevice({
            filters: [
                { vendorId: 0x0403, productId: 0x6010 },  // FT2232H
                { vendorId: 0x0403, productId: 0x6014 },  // FT232H
                { vendorId: 0x0403, productId: 0x6011 },  // FT4232H
            ]
        });

        await this.device.open();
        
        if (this.device.configuration === null) {
            await this.device.selectConfiguration(1);
        }
        
        // Claim interface A (JTAG)
        await this.device.claimInterface(this.interfaceNumber);
        
        // Reset and configure FTDI
        await this.ftdiReset();
        await this.setMPSSEMode();
        await this.configureMPSSE();
        
        console.log(`Connected to ${this.device.productName}`);
        return this.device;
    }

    async ftdiReset() {
        // Reset FTDI device
        await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x00,  // SIO_RESET
            value: 0x00,    // SIO_RESET_SIO
            index: this.interfaceNumber + 1
        });
        
        // Purge RX buffer
        await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x00,
            value: 0x01,    // SIO_RESET_PURGE_RX
            index: this.interfaceNumber + 1
        });
        
        // Purge TX buffer
        await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x00,
            value: 0x02,    // SIO_RESET_PURGE_TX
            index: this.interfaceNumber + 1
        });
    }

    async setMPSSEMode() {
        // Reset device first
        await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x00,  // SIO_RESET
            value: 0x00,    // SIO_RESET_SIO
            index: this.interfaceNumber + 1
        });
        
        // Set bitmode to MPSSE
        // Value: high byte = mode (0x02 = MPSSE), low byte = output mask (0x0B = TCK, TDI, TMS as outputs)
        await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x0B,  // SIO_SET_BITMODE
            value: 0x020B,  // MPSSE mode, outputs: TCK(0), TDI(1), TMS(3)
            index: this.interfaceNumber + 1
        });
        
        // Set latency timer to 1ms
        await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x09,  // SIO_SET_LATENCY_TIMER
            value: 1,
            index: this.interfaceNumber + 1
        });
        
        // Wait for mode switch
        await this.delay(50);
        
        // Read and discard any garbage data after mode switch (as openFPGALoader does)
        try {
            const garbage = await this.device.transferIn(this.endpointIn, 64);
            console.log('Cleared', garbage.data.byteLength, 'bytes after MPSSE mode switch');
        } catch (e) {
            // Ignore timeout errors
        }
    }

    async configureMPSSE() {
        // Configure MPSSE parameters - matching openFPGALoader Digilent cable config
        // Digilent: bit_low_val=0xe8, bit_low_dir=0xeb, bit_high_val=0x00, bit_high_dir=0x60
        const commands = new Uint8Array([
            this.MPSSE.DISABLE_DIV5,      // 60MHz clock base
            this.MPSSE.DISABLE_ADAPTIVE,  // Disable adaptive clocking
            this.MPSSE.DISABLE_3PHASE,    // Disable 3-phase clocking
            this.MPSSE.LOOPBACK_OFF,      // Disable loopback
            this.MPSSE.TCK_DIVISOR, 0x05, 0x00,  // 5MHz (60MHz / (1 + 5) / 2)
            // Set low byte GPIO: value=0xe8, direction=0xeb (Digilent config)
            this.MPSSE.SET_BITS_LOW, 0xe8, 0xeb,
            // Set high byte GPIO: value=0x00, direction=0x60
            this.MPSSE.SET_BITS_HIGH, 0x00, 0x60,
        ]);
        
        await this.device.transferOut(this.endpointOut, commands);
        await this.delay(10);
        
        console.log('MPSSE configured with Digilent cable settings');
    }

    async writeTMS(tmsData, bitLen, flush = true, tdi = 0) {
        // Write TMS bits using MPSSE WRITE_TMS command
        // Based on openFPGALoader ftdiJtagMPSSE::writeTMS
        
        console.log(`writeTMS: ${bitLen} bits, flush=${flush}, tdi=${tdi}`);
        
        // MPSSE command: WRITE_TMS | LSB | BITMODE | WRITE_NEG = 0x40 | 0x08 | 0x02 | 0x01 = 0x4B
        const MPSSE_WRITE_TMS = 0x40;
        const MPSSE_LSB = 0x08;
        const MPSSE_BITMODE = 0x02;
        const MPSSE_WRITE_NEG = 0x01;
        const cmdByte = MPSSE_WRITE_TMS | MPSSE_LSB | MPSSE_BITMODE | MPSSE_WRITE_NEG;
        
        let offset = 0;
        let remaining = bitLen;
        
        while (remaining > 0) {
            // Can send max 6 bits per TMS command (7 with TDI in bit 7)
            const bitsToSend = Math.min(6, remaining);
            let tmsByte = tdi ? 0x80 : 0x00;  // TDI in bit 7
            
            for (let i = 0; i < bitsToSend; i++) {
                const byteIdx = Math.floor(offset / 8);
                const bitIdx = offset % 8;
                const bit = (tmsData[byteIdx] >> bitIdx) & 1;
                tmsByte |= (bit << i);
                offset++;
            }
            
            // Also set last TMS bit in position after the data for holding
            // (openFPGALoader does this: buf[2] |= (curr_tms << bit_to_send))
            const lastTmsBit = (tmsByte >> (bitsToSend - 1)) & 1;
            tmsByte |= (lastTmsBit << bitsToSend);
            
            // Command format: WRITE_TMS, length-1, data (with TDI in bit 7)
            const cmd = new Uint8Array([
                cmdByte,
                bitsToSend - 1,
                tmsByte
            ]);
            
            this.buffer.push(...cmd);
            remaining -= bitsToSend;
        }
        
        if (flush) {
            await this.flush();
        }
    }

    async writeTDI(tdi, tdo, bitLen, lastBitWithTMS = false) {
        // Write TDI and optionally read TDO
        // Based on openFPGALoader ftdiJtagMPSSE::writeTDI
        
        console.log(`writeTDI: ${bitLen} bits, readBack=${tdo !== null}, lastBitWithTMS=${lastBitWithTMS}`);
        
        if (bitLen === 0) return;
        
        const readBack = tdo !== null;
        const realLen = lastBitWithTMS ? bitLen - 1 : bitLen;
        let numBytes = Math.floor(realLen / 8);
        let numBits = realLen % 8;
        
        // MPSSE command flags
        const MPSSE_LSB = 0x08;
        const MPSSE_BITMODE = 0x02;
        const MPSSE_WRITE_NEG = 0x01;
        const MPSSE_DO_WRITE = 0x10;
        const MPSSE_DO_READ = 0x20;
        const MPSSE_WRITE_TMS = 0x40;
        
        // Command byte for byte-mode: LSB first, write on -ve edge
        const byteCmd = MPSSE_LSB | MPSSE_WRITE_NEG |
                        (tdi ? MPSSE_DO_WRITE : 0) |
                        (readBack ? MPSSE_DO_READ : 0);
        
        // Command byte for bit-mode
        const bitCmd = byteCmd | MPSSE_BITMODE;
        
        let txOffset = 0;
        
        // Optimization: if only 1 byte and no remaining bits, use bit mode
        if (numBytes === 1 && numBits === 0 && !lastBitWithTMS) {
            numBytes = 0;
            numBits = 8;
        }
        
        // Send full bytes
        while (numBytes > 0) {
            const chunkSize = Math.min(numBytes, 4096);  // Reasonable chunk size
            const lenMinus1 = chunkSize - 1;
            
            // Byte write command: cmd, length-1 (low), length-1 (high), data...
            this.buffer.push(byteCmd, lenMinus1 & 0xFF, (lenMinus1 >> 8) & 0xFF);
            
            for (let i = 0; i < chunkSize; i++) {
                this.buffer.push(tdi ? (tdi[txOffset + i] || 0) : 0);
            }
            
            if (readBack) {
                this.readPending += chunkSize;
            }
            
            txOffset += chunkSize;
            numBytes -= chunkSize;
            
            // Flush if buffer getting full
            if (this.buffer.length > this.maxBufferSize - 100) {
                await this.flush();
            }
        }
        
        // Handle remaining bits (not including last bit if TMS exit needed)
        if (numBits > 0) {
            const bitData = tdi ? (tdi[txOffset] || 0) : 0;
            // Bit write command: cmd, bit_count-1, data
            this.buffer.push(bitCmd, numBits - 1, bitData);
            
            if (readBack) {
                this.readPending += 1;
            }
        }
        
        // Handle last bit with TMS transition to exit shift state
        if (lastBitWithTMS) {
            // Calculate position of the last bit
            // After processing, txOffset points to current byte, numBits tells bit position within it
            const lastBitByteIndex = txOffset;
            const lastBitPosition = numBits;  // Position within the byte (0-7)
            const lastBitData = tdi ? ((tdi[lastBitByteIndex] || 0) >> lastBitPosition) & 1 : 0;
            
            // Use TMS command with TDI in bit 7: WRITE_TMS | LSB | BITMODE | WRITE_NEG
            const tmsCmd = MPSSE_WRITE_TMS | MPSSE_LSB | MPSSE_BITMODE | MPSSE_WRITE_NEG |
                          (readBack ? MPSSE_DO_READ : 0);
            // Send 1 bit: TMS=1 to exit, TDI in bit 7
            this.buffer.push(tmsCmd, 0, lastBitData ? 0x81 : 0x01);
            
            if (readBack) {
                this.readPending += 1;
            }
        }
        
        // Final flush and read
        if (readBack && this.readPending > 0) {
            const readData = await this.flushAndRead(this.readPending);
            this.readPending = 0;
            
            // Copy read data to tdo buffer
            // For byte reads, data is direct
            // For bit reads, data needs to be shifted right by (8 - numBits)
            // For TMS read, data is in bit 7
            
            let readIdx = 0;
            let writeIdx = 0;
            const originalRealLen = lastBitWithTMS ? bitLen - 1 : bitLen;
            const originalNumBytes = Math.floor(originalRealLen / 8);
            const originalNumBits = originalRealLen % 8;
            
            // Was single byte converted to bits?
            const wasConvertedToBits = (Math.floor((lastBitWithTMS ? bitLen - 1 : bitLen) / 8) === 1 && 
                                        (lastBitWithTMS ? bitLen - 1 : bitLen) % 8 === 0 && 
                                        !lastBitWithTMS);
            
            if (wasConvertedToBits) {
                // 8 bits read, data needs shift
                if (readIdx < readData.length && writeIdx < tdo.length) {
                    tdo[writeIdx++] = readData[readIdx++];
                }
            } else {
                // Copy full bytes directly
                for (let i = 0; i < originalNumBytes && readIdx < readData.length; i++) {
                    if (writeIdx < tdo.length) {
                        tdo[writeIdx++] = readData[readIdx++];
                    }
                }
                
                // Handle remaining bits (shifted right)
                if (originalNumBits > 0 && readIdx < readData.length) {
                    const bitByte = readData[readIdx++] >> (8 - originalNumBits);
                    if (writeIdx < tdo.length) {
                        tdo[writeIdx] = bitByte;
                        // Don't increment writeIdx yet - might need to OR with TMS bit
                    }
                }
            }
            
            // Handle last bit from TMS command (comes in bit 7)
            if (lastBitWithTMS && readIdx < readData.length) {
                const lastBit = (readData[readIdx] >> 7) & 1;
                const lastBitPos = originalNumBits > 0 ? originalNumBits : 
                                   (wasConvertedToBits ? 0 : (originalNumBytes > 0 ? 0 : 0));
                if (writeIdx < tdo.length) {
                    tdo[writeIdx] = (tdo[writeIdx] || 0) | (lastBit << lastBitPos);
                }
            }
        } else {
            await this.flush();
        }
    }

    async toggleClk(tms, tdi, count) {
        // Toggle clock without data transfer
        // Based on openFPGALoader ftdiJtagMPSSE::toggleClk
        
        let remaining = count;
        
        while (remaining > 0) {
            if (remaining >= 8) {
                // Use byte clock command (8 bits at a time)
                const cycles8 = Math.min(Math.floor(remaining / 8), 65536);
                const lenMinus1 = cycles8 - 1;
                
                const cmd = new Uint8Array([
                    this.MPSSE.CLOCK_BYTES,
                    lenMinus1 & 0xFF,
                    (lenMinus1 >> 8) & 0xFF
                ]);
                this.buffer.push(...cmd);
                
                remaining -= cycles8 * 8;
            } else {
                // Use bit clock command
                const cmd = new Uint8Array([
                    this.MPSSE.CLOCK_BITS,
                    remaining - 1
                ]);
                this.buffer.push(...cmd);
                remaining = 0;
            }
            
            // Flush if buffer getting full
            if (this.buffer.length > this.maxBufferSize - 10) {
                await this.flush();
            }
        }
        
        await this.flush();
    }

    async flush() {
        if (this.buffer.length === 0) return;
        
        const data = new Uint8Array(this.buffer);
        this.buffer = [];
        
        console.log('flush:', data.length, 'bytes:', Array.from(data.slice(0, Math.min(20, data.length))).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        await this.device.transferOut(this.endpointOut, data);
    }

    async flushAndRead(expectedBytes) {
        // Add send immediate command to flush FTDI buffer
        this.buffer.push(this.MPSSE.SEND_IMMEDIATE);
        
        const data = new Uint8Array(this.buffer);
        this.buffer = [];
        
        console.log('Sending', data.length, 'bytes, expecting', expectedBytes, 'bytes back');
        console.log('TX:', Array.from(data.slice(0, Math.min(32, data.length))).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        await this.device.transferOut(this.endpointOut, data);
        
        // Read response from FTDI
        // FTDI adds 2 status bytes to the beginning of each 62-byte data packet
        // (64-byte USB packet = 2 status + 62 data)
        const result = [];
        let remaining = expectedBytes;
        let retries = 0;
        const maxRetries = 100;
        
        while (remaining > 0 && retries < maxRetries) {
            try {
                // Request more than we need to handle FTDI's 2-byte overhead
                const readSize = Math.min(512, remaining + 64);
                const response = await this.device.transferIn(this.endpointIn, readSize);
                const responseData = new Uint8Array(response.data.buffer);
                
                console.log('RX:', responseData.length, 'bytes:', 
                    Array.from(responseData.slice(0, Math.min(16, responseData.length))).map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                if (responseData.length > 2) {
                    // Skip first 2 status bytes, collect data
                    for (let i = 2; i < responseData.length && result.length < expectedBytes; i++) {
                        result.push(responseData[i]);
                        remaining--;
                    }
                } else {
                    // Only got status bytes, wait a bit and retry
                    await this.delay(1);
                    retries++;
                }
            } catch (e) {
                console.warn('Read error:', e);
                await this.delay(1);
                retries++;
            }
        }
        
        if (remaining > 0) {
            console.warn(`Only read ${result.length} of ${expectedBytes} expected bytes`);
        }
        
        console.log('Read result:', result.length, 'bytes:', 
            Array.from(result.slice(0, Math.min(16, result.length))).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        return new Uint8Array(result);
    }

    async close() {
        if (this.device) {
            await this.device.releaseInterface(this.interfaceNumber);
            await this.device.close();
            this.device = null;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
