// SPDX-License-Identifier: MIT

pragma solidity >= 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract Vault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    event Withdrawal(uint256 amount);

    constructor(address _token) public {
        token = IERC20(_token);
    }

    function balance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(amount != 0, "Vault: amount must be > 0");
        require(amount <= balance(), "Vault: amount exceeds balance");

        token.safeTransfer(to, amount);

        emit Withdrawal(amount);
    }
}
