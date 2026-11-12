package com.philomath.api.web;

import com.philomath.api.dto.CurrencyCode;
import com.philomath.api.dto.OrderStatus;
import com.philomath.api.dto.Priority;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public class OrderFilter {

    private String orderNumber;
    private OrderStatus status;
    private Priority priority;
    private String customerName;
    private String customerEmail;
    private CurrencyCode currency;
    private String countryCode;
    private String warehouseCode;
    private Boolean giftWrap;
    private String notes;
    private Integer quantityMin;
    private Integer quantityMax;
    private Double unitPriceMin;
    private Double unitPriceMax;
    private Double taxRateMin;
    private Double taxRateMax;
    private Double discountMin;
    private Double discountMax;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private OffsetDateTime orderedFrom;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private OffsetDateTime orderedTo;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate deliveryFrom;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate deliveryTo;

    public String getOrderNumber() {
        return orderNumber;
    }

    public void setOrderNumber(String orderNumber) {
        this.orderNumber = orderNumber;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public void setStatus(OrderStatus status) {
        this.status = status;
    }

    public Priority getPriority() {
        return priority;
    }

    public void setPriority(Priority priority) {
        this.priority = priority;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getCustomerEmail() {
        return customerEmail;
    }

    public void setCustomerEmail(String customerEmail) {
        this.customerEmail = customerEmail;
    }

    public CurrencyCode getCurrency() {
        return currency;
    }

    public void setCurrency(CurrencyCode currency) {
        this.currency = currency;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public void setCountryCode(String countryCode) {
        this.countryCode = countryCode;
    }

    public String getWarehouseCode() {
        return warehouseCode;
    }

    public void setWarehouseCode(String warehouseCode) {
        this.warehouseCode = warehouseCode;
    }

    public Boolean getGiftWrap() {
        return giftWrap;
    }

    public void setGiftWrap(Boolean giftWrap) {
        this.giftWrap = giftWrap;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Integer getQuantityMin() {
        return quantityMin;
    }

    public void setQuantityMin(Integer quantityMin) {
        this.quantityMin = quantityMin;
    }

    public Integer getQuantityMax() {
        return quantityMax;
    }

    public void setQuantityMax(Integer quantityMax) {
        this.quantityMax = quantityMax;
    }

    public Double getUnitPriceMin() {
        return unitPriceMin;
    }

    public void setUnitPriceMin(Double unitPriceMin) {
        this.unitPriceMin = unitPriceMin;
    }

    public Double getUnitPriceMax() {
        return unitPriceMax;
    }

    public void setUnitPriceMax(Double unitPriceMax) {
        this.unitPriceMax = unitPriceMax;
    }

    public Double getTaxRateMin() {
        return taxRateMin;
    }

    public void setTaxRateMin(Double taxRateMin) {
        this.taxRateMin = taxRateMin;
    }

    public Double getTaxRateMax() {
        return taxRateMax;
    }

    public void setTaxRateMax(Double taxRateMax) {
        this.taxRateMax = taxRateMax;
    }

    public Double getDiscountMin() {
        return discountMin;
    }

    public void setDiscountMin(Double discountMin) {
        this.discountMin = discountMin;
    }

    public Double getDiscountMax() {
        return discountMax;
    }

    public void setDiscountMax(Double discountMax) {
        this.discountMax = discountMax;
    }

    public OffsetDateTime getOrderedFrom() {
        return orderedFrom;
    }

    public void setOrderedFrom(OffsetDateTime orderedFrom) {
        this.orderedFrom = orderedFrom;
    }

    public OffsetDateTime getOrderedTo() {
        return orderedTo;
    }

    public void setOrderedTo(OffsetDateTime orderedTo) {
        this.orderedTo = orderedTo;
    }

    public LocalDate getDeliveryFrom() {
        return deliveryFrom;
    }

    public void setDeliveryFrom(LocalDate deliveryFrom) {
        this.deliveryFrom = deliveryFrom;
    }

    public LocalDate getDeliveryTo() {
        return deliveryTo;
    }

    public void setDeliveryTo(LocalDate deliveryTo) {
        this.deliveryTo = deliveryTo;
    }
}
