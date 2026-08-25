echo 'umask 027'>> ~/.bash_profile
echo "export ECE2612=/data/courses/ece_2612">> ~/.bash_profile
echo 'PATH=$PATH:$ECE2612/bin'>> ~/.bash_profile

# Add pof2svf only if it does not already exist
if ! grep -q '^pof2svf()' ~/.bash_profile 2>/dev/null; then
    cat >> ~/.bash_profile <<'EOF'

# Convert Quartus .pof file to .p.svf for DE10-Lite
pof2svf() {
    local file_base_name="$1"

    if [ -z "$file_base_name" ]; then
        echo "Usage: pof2svf <file_base_name>"
        return 1
    fi

    quartus_cpf -c -q 1MHz -g 3.3 -n p \
        "output_files/${file_base_name}.pof" \
        "output_files/${file_base_name}.p.svf"
}
EOF
fi

mkdir -p ~/.vscode-server/data/Machine
cp settings.json ~/.vscode-server/data/Machine
rm -rf ~/.git
rm -rf .git

for i in lab1 lab2 lab3 lab4 lab5 lab5a lab6 lab6a lab7a lab7c lab8 lego/lab17 lego/lab18 lego/lab19
do
   cp ./intel_extra_files_2020f/$i/* $i/
done

#alias quartus_cpf  -c -q 1MHz -g 3.3 -n p output_files/$file_base_name.pof output_files/$file_base_name.p.svf
