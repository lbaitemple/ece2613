//
// lab1 : version 06/12/2020
// 
`timescale 1ns / 1ps
module gates(
	output logic f0, output logic f1, output logic f2, output logic f3,
	input logic a0, input logic b0, input logic a1, input logic b1,
	input logic a2, input logic b2, input logic a3, input logic b3
	);

	// Write code starting here ...
	assign f0 = a0 & b0;   // AND gate
	assign f1 = a1 | b1;   // OR gate
	assign f2 = a2 ^ b2;   // XOR gate
	assign f3 = ~(a3 & b3); // NAND gate

endmodule
