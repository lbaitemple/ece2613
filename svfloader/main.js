import { USBBlasterII } from './usb-blaster.js';  // Note: Despite the name, this works with USB-Blaster I
import { SVFParser } from './svf-parser.js';
import { JTAGStateMachine } from './jtag-state-machine.js';
import { XilinxJTAG, DigilentFTDI } from './xilinx-jtag.js';

class FPGAProgrammer {
    constructor() {
        // SVF tab state
        this.usbBlaster = null;
        this.svfData = null;
        this.svfCommands = null;
        
        // BIT tab state
        this.ftdiDevice = null;
        this.xilinxJtag = null;
        this.bitData = null;
        this.bitInfo = null;
        
        this.initUI();
        this.initTabs();
    }

    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                
                // Update button states
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update content visibility
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === tabId) {
                        content.classList.add('active');
                    }
                });
            });
        });
    }

    initUI() {
        // SVF Tab elements
        this.connectBtn = document.getElementById('connectBtn');
        this.deviceStatus = document.getElementById('deviceStatus');
        this.svfFileInput = document.getElementById('svfFile');
        this.fileInfo = document.getElementById('fileInfo');
        this.programBtn = document.getElementById('programBtn');
        this.progressBar = document.getElementById('progressBar');
        this.status = document.getElementById('status');
        this.logDiv = document.getElementById('log');

        // BIT Tab elements
        this.connectBitBtn = document.getElementById('connectBitBtn');
        this.bitDeviceStatus = document.getElementById('bitDeviceStatus');
        this.bitFileInput = document.getElementById('bitFile');
        this.bitFileInfo = document.getElementById('bitFileInfo');
        this.programBitBtn = document.getElementById('programBitBtn');
        this.flashBitBtn = document.getElementById('flashBitBtn');
        this.bitProgressBar = document.getElementById('bitProgressBar');
        this.bitStatus = document.getElementById('bitStatus');

        // SVF Tab event listeners
        this.connectBtn.addEventListener('click', () => this.connectDevice());
        this.svfFileInput.addEventListener('change', (e) => this.loadSVFFile(e));
        this.programBtn.addEventListener('click', () => this.programDevice());

        // BIT Tab event listeners
        this.connectBitBtn.addEventListener('click', () => this.connectBitDevice());
        this.bitFileInput.addEventListener('change', (e) => this.loadBitFile(e));
        this.programBitBtn.addEventListener('click', () => this.programBitDevice());
        this.flashBitBtn.addEventListener('click', () => this.flashBitDevice());
    }

    log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.logDiv.appendChild(entry);
        this.logDiv.scrollTop = this.logDiv.scrollHeight;
    }

    // ==================== SVF Tab Methods ====================
    
    async connectDevice() {
        try {
            this.log('Requesting USB device...');
            this.usbBlaster = new USBBlasterII();
            await this.usbBlaster.connect();
            
            this.deviceStatus.textContent = 'Connected';
            this.deviceStatus.className = 'status success';
            this.svfFileInput.disabled = false;
            this.log('USB Blaster connected successfully', 'success');
        } catch (error) {
            this.log(`Connection failed: ${error.message}`, 'error');
            this.deviceStatus.textContent = `Error: ${error.message}`;
            this.deviceStatus.className = 'status error';
        }
    }

    async loadSVFFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.log(`Loading SVF file: ${file.name}`);
            this.svfData = await file.text();
            
            const parser = new SVFParser();
            this.svfCommands = parser.parse(this.svfData);
            
            this.fileInfo.textContent = `Loaded: ${file.name} (${this.svfCommands.length} commands)`;
            this.programBtn.disabled = false;
            this.log(`Parsed ${this.svfCommands.length} SVF commands`, 'success');
        } catch (error) {
            this.log(`Failed to load SVF file: ${error.message}`, 'error');
            this.fileInfo.textContent = `Error: ${error.message}`;
        }
    }

    async programDevice() {
        if (!this.usbBlaster || !this.svfCommands) return;

        try {
            this.programBtn.disabled = true;
            this.log('Starting device programming...');
            
            const jtag = new JTAGStateMachine(this.usbBlaster);
            
            // Reset JTAG TAP to known state
            await jtag.reset();
            
            const startTime = Date.now();
            const logInterval = Math.max(1, Math.floor(this.svfCommands.length / 10));
            
            for (let i = 0; i < this.svfCommands.length; i++) {
                const cmd = this.svfCommands[i];
                await jtag.executeCommand(cmd);
                
                const progress = ((i + 1) / this.svfCommands.length) * 100;
                this.progressBar.style.width = `${progress}%`;
                this.progressBar.textContent = `${Math.round(progress)}%`;
                
                if (i === 0 || i === this.svfCommands.length - 1 || ((i + 1) % logInterval === 0)) {
                    this.log(`Progress: ${i + 1}/${this.svfCommands.length} commands`);
                }
            }
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.status.textContent = `Programming completed in ${elapsed}s!`;
            this.status.className = 'status success';
            this.log(`Device programmed successfully in ${elapsed}s!`, 'success');
        } catch (error) {
            this.status.textContent = `Programming failed: ${error.message}`;
            this.status.className = 'status error';
            this.log(`Programming failed: ${error.message}`, 'error');
        } finally {
            this.programBtn.disabled = false;
        }
    }

    // ==================== BIT Tab Methods ====================
    
    async connectBitDevice() {
        try {
            this.log('Requesting Digilent FTDI device...');
            
            this.ftdiDevice = new DigilentFTDI();
            const device = await this.ftdiDevice.connect();
            
            // Initialize Xilinx JTAG
            this.xilinxJtag = new XilinxJTAG(this.ftdiDevice);
            const deviceInfo = await this.xilinxJtag.init();
            
            if (deviceInfo.name) {
                this.bitDeviceStatus.textContent = `Connected: ${deviceInfo.name} (${deviceInfo.board || deviceInfo.family})`;
                this.log(`Detected: ${deviceInfo.name} - ${deviceInfo.family}`, 'success');
                this.log(`IDCODE: 0x${deviceInfo.idcode.toString(16).toUpperCase().padStart(8, '0')}`, 'info');
            } else {
                this.bitDeviceStatus.textContent = `Connected: Unknown device (ID: 0x${deviceInfo.idcode.toString(16).toUpperCase()})`;
                this.log(`Unknown device IDCODE: 0x${deviceInfo.idcode.toString(16).toUpperCase()}`, 'warning');
            }
            
            this.bitDeviceStatus.className = 'status success';
            this.bitFileInput.disabled = false;
            this.log('JTAG interface initialized', 'success');
            
        } catch (error) {
            this.log(`Connection failed: ${error.message}`, 'error');
            this.bitDeviceStatus.textContent = `Error: ${error.message}`;
            this.bitDeviceStatus.className = 'status error';
        }
    }

    async loadBitFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.log(`Loading BIT file: ${file.name}`);
            const buffer = await file.arrayBuffer();
            this.bitData = new Uint8Array(buffer);
            
            // Parse BIT file header (Xilinx format)
            this.bitInfo = this.parseBitHeader(this.bitData);
            
            let infoText = `Loaded: ${file.name} (${(this.bitData.length / 1024).toFixed(1)} KB)`;
            if (this.bitInfo.designName) {
                infoText += `\nDesign: ${this.bitInfo.designName}`;
            }
            if (this.bitInfo.deviceName) {
                infoText += `\nDevice: ${this.bitInfo.deviceName}`;
            }
            if (this.bitInfo.date && this.bitInfo.time) {
                infoText += `\nBuilt: ${this.bitInfo.date} ${this.bitInfo.time}`;
            }
            
            this.bitFileInfo.textContent = infoText;
            this.programBitBtn.disabled = false;
            this.flashBitBtn.disabled = false;
            
            this.log(`BIT file loaded: ${this.bitData.length} bytes`, 'success');
            if (this.bitInfo.deviceName) {
                this.log(`Target device: ${this.bitInfo.deviceName}`, 'info');
            }
            if (this.bitInfo.dataOffset) {
                this.log(`Config data starts at offset ${this.bitInfo.dataOffset}, length: ${this.bitInfo.dataLength} bytes`, 'info');
            }
        } catch (error) {
            this.log(`Failed to load BIT file: ${error.message}`, 'error');
            this.bitFileInfo.textContent = `Error: ${error.message}`;
        }
    }

    parseBitHeader(data) {
        // Xilinx BIT file header parser
        const info = {};
        try {
            let offset = 0;
            
            // Skip field 1 (header length)
            const headerLen = (data[0] << 8) | data[1];
            offset = 2 + headerLen;
            
            // Skip field 2
            offset += 2;
            
            // Parse tagged fields
            while (offset < Math.min(data.length, 500)) {
                const tag = data[offset++];
                if (tag === 0x61) { // 'a' - design name
                    const len = (data[offset] << 8) | data[offset + 1];
                    offset += 2;
                    info.designName = String.fromCharCode(...data.slice(offset, offset + len - 1));
                    offset += len;
                } else if (tag === 0x62) { // 'b' - device name
                    const len = (data[offset] << 8) | data[offset + 1];
                    offset += 2;
                    info.deviceName = String.fromCharCode(...data.slice(offset, offset + len - 1));
                    offset += len;
                } else if (tag === 0x63) { // 'c' - date
                    const len = (data[offset] << 8) | data[offset + 1];
                    offset += 2;
                    info.date = String.fromCharCode(...data.slice(offset, offset + len - 1));
                    offset += len;
                } else if (tag === 0x64) { // 'd' - time
                    const len = (data[offset] << 8) | data[offset + 1];
                    offset += 2;
                    info.time = String.fromCharCode(...data.slice(offset, offset + len - 1));
                    offset += len;
                } else if (tag === 0x65) { // 'e' - data
                    const len = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
                    info.dataOffset = offset + 4;
                    info.dataLength = len;
                    break;
                } else {
                    break;
                }
            }
        } catch (e) {
            // Header parsing failed, might be raw binary
        }
        return info;
    }

    async programBitDevice() {
        if (!this.xilinxJtag || !this.bitData) return;

        try {
            this.programBitBtn.disabled = true;
            this.flashBitBtn.disabled = true;
            this.log('Starting SRAM programming with BIT file...');
            
            const startTime = Date.now();
            
            // Extract raw configuration data
            let configData;
            if (this.bitInfo.dataOffset) {
                configData = this.bitData.slice(this.bitInfo.dataOffset, this.bitInfo.dataOffset + this.bitInfo.dataLength);
            } else {
                configData = this.bitData;
            }
            
            this.log(`Configuration data: ${configData.length} bytes`);
            
            // Progress callback
            const onProgress = (progress) => {
                this.bitProgressBar.style.width = `${progress}%`;
                this.bitProgressBar.textContent = `${progress}%`;
            };
            
            // Program using Xilinx JTAG
            await this.xilinxJtag.programSRAM(configData, onProgress);
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.bitProgressBar.style.width = '100%';
            this.bitProgressBar.textContent = '100%';
            this.bitStatus.textContent = `SRAM programmed in ${elapsed}s!`;
            this.bitStatus.className = 'status success';
            this.log(`FPGA configured successfully in ${elapsed}s!`, 'success');
            
        } catch (error) {
            this.bitStatus.textContent = `Programming failed: ${error.message}`;
            this.bitStatus.className = 'status error';
            this.log(`Programming failed: ${error.message}`, 'error');
            console.error(error);
        } finally {
            this.programBitBtn.disabled = false;
            this.flashBitBtn.disabled = false;
        }
    }

    async flashBitDevice() {
        if (!this.xilinxJtag || !this.bitData) return;

        try {
            this.programBitBtn.disabled = true;
            this.flashBitBtn.disabled = true;
            this.log('Starting SPI flash programming...');
            
            // SPI flash programming is complex - provide guidance
            this.bitStatus.textContent = 'SPI flash requires indirect programming';
            this.bitStatus.className = 'status info';
            
            this.log('SPI flash programming via WebUSB is complex due to:', 'info');
            this.log('  1. Need to access SPI through FPGA fabric or boundary scan', 'info');
            this.log('  2. Different SPI flash chips have different protocols', 'info');
            this.log('  3. Need sector erase before programming', 'info');
            this.log('', 'info');
            this.log('Recommended alternatives:', 'info');
            this.log('  • openFPGALoader: openFPGALoader -b basys3 -f bitfile.bit', 'info');
            this.log('  • Vivado Hardware Manager', 'info');
            this.log('  • Program SRAM first, then use your design to write flash', 'info');
            
        } catch (error) {
            this.bitStatus.textContent = `Flash failed: ${error.message}`;
            this.bitStatus.className = 'status error';
            this.log(`Flash failed: ${error.message}`, 'error');
        } finally {
            this.programBitBtn.disabled = false;
            this.flashBitBtn.disabled = false;
        }
    }
}

// Initialize the application
new FPGAProgrammer();
