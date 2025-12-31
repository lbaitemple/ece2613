# Cloud 9 setup
Instruction is provided at https://sites.google.com/a/temple.edu/ece2612/home/cloud9-setup

# after you select the instance for cloud9, in the terminal
```
sudo apt update && sudo apt upgrade -y
sudo reboot
```
After the reboot, you can do the following

```
git clone -b cloud9 https://github.com/lbaitemple/ece2613 
cd ece2613
bash ./setup.bash 
sudo reboot
```

# Test the code
- right click on m_sim (extension file) and run

- right click on qsf (extension file) and run

<!---
### wireless
```
cd wireless
docker-compose build
docker run -it bionic-bai:latest /bin/bash
```
--->
