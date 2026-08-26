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
wsl --install Ubuntu-24.04
```
# login WSL
```
wsl -d Ubuntu-24.04
```

# Install the setup
```
mkdir -p ~/environment
cd ~/environment
git clone -b wsl https://github.com/lbaitemple/ece2613 
cd ece2613
bash ./setup.bash 
```

# Test the code
- right click on m_sim (extension file) and run

- right click on qsf (extension file) and run


### wireless
```
cd wireless
docker-compose build
docker run -it bionic-bai:latest /bin/bash
```

