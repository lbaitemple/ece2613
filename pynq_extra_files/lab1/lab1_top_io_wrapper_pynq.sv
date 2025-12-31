`timescale 1ns / 1ps
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
module lab1_top_io_wrapper_pynq(
	output logic [3:0] led,
	input logic [1:0] sw,
	input logic [3:0] btn
	);
	 
	// --------- outputs ----------
	// shut everything off as a default
	// seven segment decoder with decimal point
	//assign seg = 7'b1111111;	// low is on
	// regular leds
//	assign led = 8'b00000000;	// high is on

	//assign led[7:4] = 0;	// shut unused 4 bits off
	logic r0, r1, r2, r3;
	// Instantiate the top module
	gates u_top (
		.f0(r0), .f1(r1), .f2(r2), .f3(r3),
		.a0(sw[0]), .b0(sw[1]), .a1(sw[0]), .b1(sw[1]),
		.a2(sw[0]), .b2(sw[1]), .a3(sw[0]), .b3(sw[1])
	);

	always_comb begin
		if (btn[0]) 
			led[0] = r0;
		else if (btn[1]) 
			led[1] = r1;
		else if (btn[2]) 
			led[2] = r2;
		else if (btn[3]) 
			led[3] = r3;
		else
			led[0] = r0;
	end

endmodule
