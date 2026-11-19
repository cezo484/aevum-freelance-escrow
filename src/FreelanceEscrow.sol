// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FreelanceEscrow
/// @notice Holds a client's tUSD8 payment in escrow until the freelancer
/// delivers the work and the client approves it. If the deadline passes
/// with no delivery, the client can take the funds back. A short dispute
/// window after delivery lets the client flag a problem before paying.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract FreelanceEscrow {
    IERC20 public immutable token;

    /// @notice How long the client has to open a dispute after delivery,
    /// and how long a dispute stays open before a refund is allowed.
    uint256 public constant DISPUTE_WINDOW = 3 days;

    enum Status {
        Created,
        Delivered,
        Released,
        Refunded,
        Disputed
    }

    struct Invoice {
        address client;
        address freelancer;
        uint256 amount;
        uint256 deadline;
        uint256 deliveredAt;
        uint256 disputeOpenedAt;
        Status status;
    }

    uint256 public nextInvoiceId;
    mapping(uint256 => Invoice) public invoices;

    // Simple reentrancy guard. 1 means open, 2 means locked.
    uint256 private _guard = 1;

    event InvoiceCreated(
        uint256 indexed id, address indexed client, address indexed freelancer, uint256 amount, uint256 deadline
    );
    event Delivered(uint256 indexed id, address indexed freelancer, uint256 deliveredAt);
    event Released(uint256 indexed id, address indexed freelancer, uint256 amount);
    event Refunded(uint256 indexed id, address indexed client, uint256 amount);
    event DisputeOpened(uint256 indexed id, address indexed client, uint256 disputeOpenedAt);

    error ZeroAmount();
    error ZeroAddress();
    error SelfInvoice();
    error DeadlineInPast();
    error DeadlinePassed();
    error NotClient();
    error NotFreelancer();
    error WrongStatus(Status status);
    error DisputeWindowClosed();
    error TooEarly();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_guard != 1) revert Reentrancy();
        _guard = 2;
        _;
        _guard = 1;
    }

    constructor(address token_) {
        if (token_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
    }

    /// @notice Lock `amount` of tUSD8 in escrow for `freelancer`.
    /// The caller must approve this contract to spend `amount` first.
    /// Returns the new invoice id.
    function createInvoice(address freelancer, uint256 amount, uint256 deadline)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (freelancer == address(0)) revert ZeroAddress();
        if (freelancer == msg.sender) revert SelfInvoice();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlineInPast();

        id = nextInvoiceId;
        nextInvoiceId += 1;

        invoices[id] = Invoice({
            client: msg.sender,
            freelancer: freelancer,
            amount: amount,
            deadline: deadline,
            deliveredAt: 0,
            disputeOpenedAt: 0,
            status: Status.Created
        });

        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        emit InvoiceCreated(id, msg.sender, freelancer, amount, deadline);
    }

    /// @notice The freelancer marks the work delivered. Delivery must
    /// happen on or before the deadline. A disputed invoice can be
    /// delivered again after rework, which restarts the dispute window.
    function markDelivered(uint256 id) external {
        Invoice storage invoice = invoices[id];
        if (msg.sender != invoice.freelancer) revert NotFreelancer();
        if (invoice.status != Status.Created && invoice.status != Status.Disputed) {
            revert WrongStatus(invoice.status);
        }
        if (block.timestamp > invoice.deadline) revert DeadlinePassed();

        invoice.status = Status.Delivered;
        invoice.deliveredAt = block.timestamp;
        invoice.disputeOpenedAt = 0;

        emit Delivered(id, msg.sender, block.timestamp);
    }

    /// @notice The client approves the work and releases payment to the
    /// freelancer. Also works on a disputed invoice when the client
    /// accepts the work after all.
    function approveAndRelease(uint256 id) external nonReentrant {
        Invoice storage invoice = invoices[id];
        if (msg.sender != invoice.client) revert NotClient();
        if (invoice.status != Status.Delivered && invoice.status != Status.Disputed) {
            revert WrongStatus(invoice.status);
        }

        invoice.status = Status.Released;

        if (!token.transfer(invoice.freelancer, invoice.amount)) revert TransferFailed();

        emit Released(id, invoice.freelancer, invoice.amount);
    }

    /// @notice The client takes the funds back. Allowed in two cases:
    /// the deadline passed with no delivery, or a dispute stayed open
    /// for the full dispute window without a resolution.
    function refundAfterTimeout(uint256 id) external nonReentrant {
        Invoice storage invoice = invoices[id];
        if (msg.sender != invoice.client) revert NotClient();

        if (invoice.status == Status.Created) {
            if (block.timestamp <= invoice.deadline) revert TooEarly();
        } else if (invoice.status == Status.Disputed) {
            if (block.timestamp <= invoice.disputeOpenedAt + DISPUTE_WINDOW) {
                revert TooEarly();
            }
        } else {
            revert WrongStatus(invoice.status);
        }

        invoice.status = Status.Refunded;

        if (!token.transfer(invoice.client, invoice.amount)) revert TransferFailed();

        emit Refunded(id, invoice.client, invoice.amount);
    }

    /// @notice The client flags a problem with delivered work. The
    /// dispute must be opened within the dispute window after delivery.
    /// While disputed, the funds stay locked: the freelancer can deliver
    /// again, the client can still approve, and after the window passes
    /// the client can claim a refund.
    function openDispute(uint256 id) external {
        Invoice storage invoice = invoices[id];
        if (msg.sender != invoice.client) revert NotClient();
        if (invoice.status != Status.Delivered) revert WrongStatus(invoice.status);
        if (block.timestamp > invoice.deliveredAt + DISPUTE_WINDOW) revert DisputeWindowClosed();

        invoice.status = Status.Disputed;
        invoice.disputeOpenedAt = block.timestamp;

        emit DisputeOpened(id, msg.sender, block.timestamp);
    }

    /// @notice Read one invoice in full.
    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }

    /// @notice How many invoices exist. Valid ids run from 0 to this
    /// number minus 1.
    function invoiceCount() external view returns (uint256) {
        return nextInvoiceId;
    }
}
