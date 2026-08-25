echo 'umask 027'>> ~/.bash_profile
echo "export ECE2612=/home/ubuntu/ece2613">> ~/.bash_profile
echo 'PATH=$PATH:$ECE2612/backdoor'>> ~/.bash_profile
sed -i 's|^export MODELSIM_ROOTDIR=.*$|export MODELSIM_ROOTDIR=/home/ubuntu/intelFPGA/20.1/modelsim_ase|' ./backdoor/ms_simulate


mkdir -p ~/.vscode-server/data/Machine
cp settings.json ~/.vscode-server/data/Machine
rm -rf ~/.git
rm -rf .git

for i in lab1 lab2 lab3 lab4 lab5 lab5a lab6 lab6a lab7a lab8 lego/lab17 lego/lab18 lego/lab19
do
   cp ./intel_extra_files_2020f/$i/* $i/
done
