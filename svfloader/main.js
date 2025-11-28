import { USBBlasterII } from './usb-blaster.js';  // Note: Despite the name, this works with USB-Blaster I
import { SVFParser } from './svf-parser.js';
import { JTAGStateMachine } from './jtag-state-machine.js';

class DE10LiteLoader {
    constructor() {
        this.usbBlaster = null;
        this.svfData = null;
        this.svfCommands = null;
        
        this.initUI();
    }

    initUI() {
        this.connectBtn = document.getElementById('connectBtn');
        this.deviceStatus = document.getElementById('deviceStatus');
        this.svfFileInput = document.getElementById('svfFile');
        this.fileInfo = document.getElementById('fileInfo');
        this.programBtn = document.getElementById('programBtn');
        this.progressBar = document.getElementById('progressBar');
        this.status = document.getElementById('status');
        this.logDiv = document.getElementById('log');

        this.connectBtn.addEventListener('click', () => this.connectDevice());
        this.svfFileInput.addEventListener('change', (e) => this.loadSVFFile(e));
        this.programBtn.addEventListener('click', () => this.programDevice());
    }

    log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.logDiv.appendChild(entry);
        this.logDiv.scrollTop = this.logDiv.scrollHeight;
    }

    async connectDevice() {
        try {
            this.log('Requesting USB device...');
            this.usbBlaster = new USBBlasterII();
            await this.usbBlaster.connect();
            
            this.deviceStatus.textContent = 'Connected';
            this.deviceStatus.className = 'status success';
            this.svfFileInput.disabled = false;
            this.log('USB Blaster II connected successfully', 'success');
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
            
            this.status.textContent = 'Programming completed successfully!';
            this.status.className = 'status success';
            this.log('Device programmed successfully!', 'success');
        } catch (error) {
            this.status.textContent = `Programming failed: ${error.message}`;
            this.status.className = 'status error';
            this.log(`Programming failed: ${error.message}`, 'error');
        } finally {
            this.programBtn.disabled = false;
        }
    }
}

// Initialize the application
new DE10LiteLoader();
