# 2613_2022s
Instruction is provided at https://sites.google.com/a/temple.edu/ece2612/home/cloud9-setup

Server Address: `ece-000.eng.temple.edu`

Login to in your aws cloud 9
```
git clone -b spring2022 https://github.com/lbaitemple/ece2613 fall2021
```

### GTK setup
```
sudo apt update && sudo apt upgrade -y
rm -rf var/lib/dpkg/lock*
sudo dpkg --configure -a
sudo apt update && sudo apt upgrade -y
sudo apt install sshfs gtkwave -y
sudo modprobe fuse
```
After that, you can run
```
cd fall2021
chmod +x gen.sh
./gen.sh
```

Now, connect the drive
```
ssh-keygen -t rsa -b 4096 -C "lbai_student@ece-000.eng.temple.edu"
ssh-copy-id lbai_student@ece-000.eng.temple.edu
```

```
mkdir ece2613
echo "alias conn2613='sshfs lbai_student@ece-000.eng.temple.edu:/home/lbai_student/ece2613 /home/ubuntu/environment/ece2613'" >> ~/.bashrc
```


### new command with using bashrc command
```
sudo sh -c 'echo "lbai_student@ece-000.eng.temple.edu:/home/lbai_student/ece2613 /home/ubuntu/environment/ece2613  fuse.sshfs  defaults  0  0" >> /etc/fstab' 
```

```
#sudo sh -c "lbai_student@ece-000.eng.temple.edu:/home/lbai_student/ece2613 /home/ubuntu/environment/ece2613  fuse.sshfs  defaults  0  0 >> #/etc/fstab"
#source ~/.bashrc
#cp -r ece2613/.c9/runners ~/.c9/
```

Here are the command line equivalents for the Intel/Altera tools:

Simulation - Modelsim simulator (only the basename is used)
```
$ECE2612/backdoor/ms_simulate <Verilog file basename>
```
Example from lab3: 
```
$ECE2612/backdoor/ms_simulate svn_seg_decoder
```

Synthesis (use the top_io_wrapper basename)
```
$ECE2612/backdoor/q_synthesize <top wrapper basename>
```
Example from lab3: 
```
$ECE2612/backdoor/q_synthesize lab3_top_io_wrapper
```
