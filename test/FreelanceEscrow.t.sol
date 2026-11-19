// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/FreelanceEscrow.sol";

/// @notice Minimal cheatcode interface, so the suite runs on a plain
/// Foundry install with no extra packages.
interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function prank(address who) external;
    function startPrank(address who) external;
    function stopPrank() external;
    function warp(uint256 time) external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

/// @notice Small ERC20 stand-in for tUSD8: 6 decimals, mintable.
contract MockUSD8 {
    string public name = "Test USD8";
    string public symbol = "tUSD8";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract FreelanceEscrowTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSD8 internal token;
    FreelanceEscrow internal escrow;

    address internal client = address(0xC11e);
    address internal freelancer = address(0xF1e);
    address internal stranger = address(0x57);

    uint256 internal constant AMOUNT = 100_000000; // 100 tUSD8, 6 decimals
    uint256 internal constant CLIENT_FUNDS = 10_000_000000; // 10,000 tUSD8

    function setUp() public {
        token = new MockUSD8();
        escrow = new FreelanceEscrow(address(token));
        token.mint(client, CLIENT_FUNDS);
        vm.prank(client);
        token.approve(address(escrow), CLIENT_FUNDS);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(client);
        id = escrow.createInvoice(freelancer, AMOUNT, block.timestamp + 7 days);
    }

    function _deliver(uint256 id) internal {
        vm.prank(freelancer);
        escrow.markDelivered(id);
    }

    function assertEq(uint256 a, uint256 b, string memory label) internal pure {
        require(a == b, label);
    }

    function assertEq(address a, address b, string memory label) internal pure {
        require(a == b, label);
    }

    function assertTrue(bool value, string memory label) internal pure {
        require(value, label);
    }

    function testHappyPathRelease() public {
        vm.recordLogs();
        uint256 id = _create();

        // The creation event fired.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool sawCreated = false;
        bytes32 createdTopic = keccak256("InvoiceCreated(uint256,address,address,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == createdTopic) {
                sawCreated = true;
            }
        }
        assertTrue(sawCreated, "InvoiceCreated event missing");

        assertEq(token.balanceOf(address(escrow)), AMOUNT, "escrow holds funds");
        assertEq(token.balanceOf(client), CLIENT_FUNDS - AMOUNT, "client paid in");

        _deliver(id);
        FreelanceEscrow.Invoice memory invoice = escrow.getInvoice(id);
        assertTrue(invoice.status == FreelanceEscrow.Status.Delivered, "status delivered");

        vm.prank(client);
        escrow.approveAndRelease(id);

        assertEq(token.balanceOf(freelancer), AMOUNT, "freelancer paid");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow empty");
        invoice = escrow.getInvoice(id);
        assertTrue(invoice.status == FreelanceEscrow.Status.Released, "status released");
    }

    function testRefundAfterTimeout() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 8 days);

        vm.prank(client);
        escrow.refundAfterTimeout(id);

        assertEq(token.balanceOf(client), CLIENT_FUNDS, "client refunded");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow empty");
        FreelanceEscrow.Invoice memory invoice = escrow.getInvoice(id);
        assertTrue(invoice.status == FreelanceEscrow.Status.Refunded, "status refunded");
    }

    function testRefundBeforeTimeoutReverts() public {
        uint256 id = _create();
        vm.prank(client);
        vm.expectRevert(FreelanceEscrow.TooEarly.selector);
        escrow.refundAfterTimeout(id);
    }

    function testWrongCallerMarkDelivered() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert(FreelanceEscrow.NotFreelancer.selector);
        escrow.markDelivered(id);
    }

    function testWrongCallerRelease() public {
        uint256 id = _create();
        _deliver(id);
        vm.prank(freelancer);
        vm.expectRevert(FreelanceEscrow.NotClient.selector);
        escrow.approveAndRelease(id);
    }

    function testWrongCallerRefund() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 8 days);
        vm.prank(freelancer);
        vm.expectRevert(FreelanceEscrow.NotClient.selector);
        escrow.refundAfterTimeout(id);
    }

    function testDoubleReleaseReverts() public {
        uint256 id = _create();
        _deliver(id);
        vm.prank(client);
        escrow.approveAndRelease(id);
        vm.prank(client);
        vm.expectRevert(
            abi.encodeWithSelector(
                FreelanceEscrow.WrongStatus.selector, FreelanceEscrow.Status.Released
            )
        );
        escrow.approveAndRelease(id);
    }

    function testReleaseBeforeDeliveryReverts() public {
        uint256 id = _create();
        vm.prank(client);
        vm.expectRevert(
            abi.encodeWithSelector(
                FreelanceEscrow.WrongStatus.selector, FreelanceEscrow.Status.Created
            )
        );
        escrow.approveAndRelease(id);
    }

    function testZeroAmountReverts() public {
        vm.prank(client);
        vm.expectRevert(FreelanceEscrow.ZeroAmount.selector);
        escrow.createInvoice(freelancer, 0, block.timestamp + 7 days);
    }

    function testPastDeadlineReverts() public {
        vm.prank(client);
        vm.expectRevert(FreelanceEscrow.DeadlineInPast.selector);
        escrow.createInvoice(freelancer, AMOUNT, block.timestamp);
    }

    function testSelfInvoiceReverts() public {
        vm.prank(client);
        vm.expectRevert(FreelanceEscrow.SelfInvoice.selector);
        escrow.createInvoice(client, AMOUNT, block.timestamp + 7 days);
    }

    function testZeroAddressFreelancerReverts() public {
        vm.prank(client);
        vm.expectRevert(FreelanceEscrow.ZeroAddress.selector);
        escrow.createInvoice(address(0), AMOUNT, block.timestamp + 7 days);
    }

    function testDeliverAfterDeadlineReverts() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 8 days);
        vm.prank(freelancer);
        vm.expectRevert(FreelanceEscrow.DeadlinePassed.selector);
        escrow.markDelivered(id);
    }

    function testCreateWithoutApprovalReverts() public {
        address broke = address(0xB0);
        token.mint(broke, AMOUNT);
        vm.prank(broke);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "allowance"));
        escrow.createInvoice(freelancer, AMOUNT, block.timestamp + 7 days);
    }

    function testDisputeThenRedeliverThenRelease() public {
        uint256 id = _create();
        _deliver(id);

        vm.prank(client);
        escrow.openDispute(id);
        FreelanceEscrow.Invoice memory invoice = escrow.getInvoice(id);
        assertTrue(invoice.status == FreelanceEscrow.Status.Disputed, "status disputed");

        // The freelancer reworks and delivers again.
        _deliver(id);
        invoice = escrow.getInvoice(id);
        assertTrue(invoice.status == FreelanceEscrow.Status.Delivered, "status delivered again");

        vm.prank(client);
        escrow.approveAndRelease(id);
        assertEq(token.balanceOf(freelancer), AMOUNT, "freelancer paid after dispute");
    }

    function testDisputeThenRefundAfterWindow() public {
        uint256 id = _create();
        _deliver(id);
        vm.prank(client);
        escrow.openDispute(id);

        // Too early to refund while the dispute window is open.
        vm.prank(client);
        vm.expectRevert(FreelanceEscrow.TooEarly.selector);
        escrow.refundAfterTimeout(id);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(client);
        escrow.refundAfterTimeout(id);
        assertEq(token.balanceOf(client), CLIENT_FUNDS, "client refunded after dispute");
    }

    function testDisputeAfterWindowReverts() public {
        vm.prank(client);
        uint256 id = escrow.createInvoice(freelancer, AMOUNT, block.timestamp + 30 days);
        _deliver(id);
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(client);
        vm.expectRevert(FreelanceEscrow.DisputeWindowClosed.selector);
        escrow.openDispute(id);
    }

    function testDisputeByNonClientReverts() public {
        uint256 id = _create();
        _deliver(id);
        vm.prank(freelancer);
        vm.expectRevert(FreelanceEscrow.NotClient.selector);
        escrow.openDispute(id);
    }

    function testInvoiceCountAndGetter() public {
        assertEq(escrow.invoiceCount(), 0, "count starts at 0");
        uint256 first = _create();
        uint256 second = _create();
        assertEq(first, 0, "first id is 0");
        assertEq(second, 1, "second id is 1");
        assertEq(escrow.invoiceCount(), 2, "count is 2");

        FreelanceEscrow.Invoice memory invoice = escrow.getInvoice(second);
        assertEq(invoice.client, client, "getter client");
        assertEq(invoice.freelancer, freelancer, "getter freelancer");
        assertEq(invoice.amount, AMOUNT, "getter amount");
        assertTrue(invoice.status == FreelanceEscrow.Status.Created, "getter status");
    }
}
