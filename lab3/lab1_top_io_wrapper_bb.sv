`timescale 1ns / 1ps
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
module lab1_top_io_wrapper(
	output logic [3:0] led,
	input logic [7:0] sw
	);
	 
	// --------- outputs ----------
	// shut everything off as a default
	// seven segment decoder with decimal point
	//assign seg = 7'b1111111;	// low is on
	// regular leds
//	assign led = 8'b00000000;	// high is on

	//assign led[7:4] = 0;	// shut unused 4 bits off
	
	// Instantiate the top module
	gates u_top (
		.f0(led[0]), .f1(led[1]), .f2(led[2]), .f3(led[3]),
		.a0(sw[0]), .b0(sw[1]), .a1(sw[2]), .b1(sw[3]),
		.a2(sw[4]), .b2(sw[5]), .a3(sw[6]), .b3(sw[7])
	);

endmodule
