#
create_project $MODULE -in_memory -part xc7z020clg400-1
                                        
add_files $SOURCE_FILES
read_xdc $CONSTRAINTS
synth_design -name $MODULE -top $MODULE -part xc7z020clg400-1

# write_checkpoint can be used to store intermediate values
#write_checkpoint -force $MODULE-synth.dcp

# link_design had errors for lab1
#link_design	;# open a netlist design

opt_design	;# optimize design
place_design	;# Automatically place ports and leaf-level instances

#write_checkpoint -force $MODULE-place.dcp
phys_opt_design	;# Optimize the current placed netlist

route_design	;# Route the current design
#write_checkpoint -force $MODULE-routed.dcp

report_timing_summary	;# Report timing summary
write_bitstream -force $MODULE.bit	;# Write a bitstream for the current design

# remove backup files - if debugging, may want to comment this next line out
file delete [glob -nocomplain vivado*.backup.*]
