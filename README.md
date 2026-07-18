# WSL on Windows 11
Instruction is provided at https://sites.google.com/a/temple.edu/ece2612/home/cloud9-setup

### Download VScode  (https://code.visualstudio.com/Download)
#### find the following extensions
0. wsl
1. remote ssh
2. code runner
3. wavetrace
4. SystemVerilog - Language Support
   
# Install an ubuntu distro in windows terminal

## please use username **ubuntu** for the installation
```
multipass launch 24.04 --name ubuntu-24 --disk 20G
multipass shell ubuntu-24

```
# login WSL
```
wsl -d ubuntu-22.04
```

# Install the setup
```
git clone -b wsl https://github.com/lbaitemple/ece2613 
cd ece2613
bash ./setup.bash 
```

# Test the code
- right click on m_sim (extension file) and run

- right click on qsf (extension file) and run




