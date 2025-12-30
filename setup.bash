export DEBIAN_FRONTEND=noninteractive
 #wget https://raw.githubusercontent.com/lbaitemple/mangdang/main/install-resize.sh
wget https://raw.githubusercontent.com/lbaitemple/ece2613/refs/heads/cloud9/install-resize.sh
 cat ./install-resize.sh   | sudo -E bash -

 ### 2. Install Desktop
wget https://raw.githubusercontent.com/aws-samples/robotics-boilerplate/main/install-desktop.sh
cat ./install-desktop.sh   | sudo -E bash -
sudo sed -i "/#\$nrconf{restart} = 'i';/s/.*/\$nrconf{restart} = 'a';/" /etc/needrestart/needrestart.conf

### 3. DCV
wget https://raw.githubusercontent.com/aws-samples/robotics-boilerplate/main/install-dcv.sh
cat ./install-dcv.sh | sudo -E bash -

#wget https://github.com/lbaitemple/ece2613/releases/download/v2.0.0/QuartusLiteSetup-23.1std.0.991-linux.run
#wget https://github.com/lbaitemple/ece2613/releases/download/v2.0.0/max10-23.1std.0.991.qdz &
#wget https://github.com/lbaitemple/ece2613/releases/download/v2.0.0/ModelSimSetup-20.1.1.720-linux.run &


# chmod +x QuartusLiteSetup-23.1std.0.991-linux.run
#./QuartusLiteSetup-23.1std.0.991-linux.run --mode unattended --accept_eula 1 
# aws s3 cp s3://intellb/max10-23.1std.0.991.qdz .
# aws s3 cp s3://intellb/QuartusLiteSetup-23.1std.0.991-linux.run .
# aws s3 cp s3://intellb/ModelSimSetup-20.1.1.720-linux.run .
# chmod +x ModelSimSetup-20.1.1.720-linux.run
#./ModelSimSetup-20.1.1.720-linux.run --mode unattended --accept_eula 1 
#sudo  apt-get install libxft2 libxft2:i386 libxrender1:i386 libxtst6:i386 libxi6:i386 -y
# aws s3 cp s3://intellb/backdoor.zip .
#gdown --id 1ESAcilkTnWTU6mUQ7irp1BWktr8h110n --output  backdoor.zip
wget https://github.com/lbaitemple/ece2613/releases/download/v2.0.0/backdoor.zip
unzip backdoor.zip 
echo "export PATH='$PATH:/home/ubuntu/intelFPGA_lite/23.1std/quartus/bin:/home/ubuntu/environment/backdoor'" > ~/.bashrc

wget https://github.com/lbaitemple/ece2613/releases/download/v2.0.0/FPGAs_AdaptiveSoCs_Unified_2024.2_1113_1001_Lin64.bin
chmod +x FPGAs_AdaptiveSoCs_Unified_2024.2_1113_1001_Lin64.bin

sudo dpkg --add-architecture i386 
sudo apt-get update 
#sudo sed -i "/#\$nrconf{restart} = 'i';/s/.*/\$nrconf{restart} = 'a';/" /etc/needrestart/needrestart.conf
sudo apt-get install libc6:i386 libncurses5:i386 libstdc++6:i386 gtkwave -y
sudo apt-get install lib32z1 libxrender1:i386  libxft2 libxft2:i386  libxtst6:i386 libxi6:i386 libtinfo5 -y
#git clone -b spring2022 https://github.com/lbaitemple/ece2613 
cp -r .c9 ~/environment
sudo rm -rf *.run max10-23.1std.0.991.qdz backdoor.zip install*.sh nice-dcv-* 
#cd ece2613
chmod +x updateos.sh
./updateos.sh
