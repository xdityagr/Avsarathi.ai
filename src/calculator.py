"""
EMI Calculator — pure computation, no LLM.

Supports three moratorium treatments per architecture.md:
1. Simple interest during moratorium (default) — borrower pays interest-only
2. Capitalized interest — unpaid interest added to principal
3. Government subvention — ₹0 during moratorium

Rate lookup comes from scheme config (rules.md), never hardcoded here.
Women's 0.5% rebate for Educational Loan is applied in this module.

Default tenure: 84 months (7 years) from NSFDC direct verification.
Default moratorium: 6 months from NSFDC direct verification.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class MoratoriumType(str, Enum):
    """Moratorium interest treatment."""
    SIMPLE_INTEREST = "simple_interest"   # Borrower pays interest-only during moratorium
    CAPITALIZED = "capitalized"           # Unpaid interest added to principal
    SUBVENTION = "subvention"             # ₹0 during moratorium (govt. subsidized)


@dataclass
class EMIResult:
    """Complete EMI calculation result."""
    loan_amount: float                    # Principal (project_cost × financing_pct)
    rate_annual: float                    # Applied annual rate (after any rebate)
    tenure_months: int                    # Total tenure including moratorium
    moratorium_months: int                # Moratorium period
    repayment_months: int                 # Months of actual EMI payments
    moratorium_type: MoratoriumType
    moratorium_monthly_payment: float     # Monthly payment during moratorium
    emi_after_moratorium: float           # Monthly EMI during repayment phase
    total_payable: float                  # Total amount paid over entire tenure
    total_interest: float                 # Total interest paid


def _reducing_balance_emi(principal: float, monthly_rate: float, months: int) -> float:
    """Standard reducing-balance EMI formula.

    EMI = P × r × (1+r)^n / ((1+r)^n - 1)

    Where P = principal, r = monthly rate, n = number of months.
    Returns 0.0 for zero months.
    """
    if months <= 0:
        return 0.0
    if monthly_rate == 0:
        return principal / months

    factor = (1 + monthly_rate) ** months
    return principal * monthly_rate * factor / (factor - 1)


def calculate_emi(
    project_cost: float,
    financing_pct: float,
    rate_annual: float,
    tenure_months: int = 84,
    moratorium_months: int = 6,
    moratorium_type: MoratoriumType = MoratoriumType.SIMPLE_INTEREST,
    women_rebate_pct: float = 0.0,
    is_female: bool = False,
) -> EMIResult:
    """Calculate EMI with moratorium treatment.

    Args:
        project_cost: Total project cost in ₹
        financing_pct: Fraction financed by NSFDC (typically 0.90)
        rate_annual: Annual interest rate (e.g. 8.0 for 8%)
        tenure_months: Total loan tenure in months (default 84 = 7 years)
        moratorium_months: Moratorium period in months (default 6)
        moratorium_type: How interest is handled during moratorium
        women_rebate_pct: Rate reduction for women (e.g. 0.5 for 0.5%)
        is_female: Whether the borrower is female (triggers rebate)

    Returns:
        EMIResult with complete payment breakdown.

    Raises:
        ValueError: If inputs are invalid (negative cost, tenure ≤ moratorium, etc.)
    """
    if project_cost < 0:
        raise ValueError("project_cost must be non-negative")
    if tenure_months <= 0:
        raise ValueError("tenure_months must be positive")
    if moratorium_months < 0:
        raise ValueError("moratorium_months must be non-negative")
    if moratorium_months >= tenure_months:
        raise ValueError("moratorium_months must be less than tenure_months")
    if rate_annual < 0:
        raise ValueError("rate_annual must be non-negative")

    # Apply women's rebate if applicable
    effective_rate = rate_annual
    if is_female and women_rebate_pct > 0:
        effective_rate = max(0.0, rate_annual - women_rebate_pct)

    # Calculate loan amount (principal)
    principal = project_cost * financing_pct

    # Handle edge case: zero principal
    if principal == 0:
        return EMIResult(
            loan_amount=0.0,
            rate_annual=round(effective_rate, 2),
            tenure_months=tenure_months,
            moratorium_months=moratorium_months,
            repayment_months=tenure_months - moratorium_months,
            moratorium_type=moratorium_type,
            moratorium_monthly_payment=0.0,
            emi_after_moratorium=0.0,
            total_payable=0.0,
            total_interest=0.0,
        )

    monthly_rate = (effective_rate / 100) / 12
    repayment_months = tenure_months - moratorium_months

    if moratorium_type == MoratoriumType.SIMPLE_INTEREST:
        # Borrower pays interest-only during moratorium; principal unchanged
        if moratorium_months > 0:
            moratorium_payment = principal * monthly_rate if monthly_rate > 0 else 0.0
        else:
            moratorium_payment = 0.0
        emi_principal = principal
        emi = _reducing_balance_emi(emi_principal, monthly_rate, repayment_months)
        total_moratorium = moratorium_payment * moratorium_months
        total_repayment = emi * repayment_months
        total_payable = total_moratorium + total_repayment

    elif moratorium_type == MoratoriumType.CAPITALIZED:
        # No payment during moratorium; interest accrues onto principal
        moratorium_payment = 0.0
        if monthly_rate > 0:
            emi_principal = principal * (1 + monthly_rate) ** moratorium_months
        else:
            emi_principal = principal
        emi = _reducing_balance_emi(emi_principal, monthly_rate, repayment_months)
        total_repayment = emi * repayment_months
        total_payable = total_repayment  # No moratorium payments

    elif moratorium_type == MoratoriumType.SUBVENTION:
        # ₹0 during moratorium — government covers the interest
        moratorium_payment = 0.0
        emi_principal = principal  # Principal unchanged
        emi = _reducing_balance_emi(emi_principal, monthly_rate, repayment_months)
        total_repayment = emi * repayment_months
        total_payable = total_repayment  # No moratorium payments

    else:
        raise ValueError(f"Unknown moratorium type: {moratorium_type}")

    total_interest = total_payable - principal

    return EMIResult(
        loan_amount=round(principal, 2),
        rate_annual=round(effective_rate, 2),
        tenure_months=tenure_months,
        moratorium_months=moratorium_months,
        repayment_months=repayment_months,
        moratorium_type=moratorium_type,
        moratorium_monthly_payment=round(moratorium_payment, 2),
        emi_after_moratorium=round(emi, 2),
        total_payable=round(total_payable, 2),
        total_interest=round(total_interest, 2),
    )
