package com.philomath.api.store;

import com.philomath.api.dto.CurrencyCode;
import com.philomath.api.dto.DeliveryAddress;
import com.philomath.api.dto.Order;
import com.philomath.api.dto.OrderRequest;
import com.philomath.api.dto.OrderStatus;
import com.philomath.api.dto.Priority;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "purchase_order")
public class OrderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40)
    private String orderNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Priority priority;

    @Column(nullable = false, length = 80)
    private String customerName;

    @Column(nullable = false, length = 120)
    private String customerEmail;

    @Column(nullable = false)
    private Integer quantity;

    @Column(nullable = false)
    private Double unitPrice;

    @Column(nullable = false)
    private Double taxRate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 3)
    private CurrencyCode currency;

    @Column(nullable = false)
    private Double discountAmount;

    @Column(nullable = false, length = 2)
    private String countryCode;

    @Column(nullable = false)
    private OffsetDateTime orderedAt;

    @Column(nullable = false)
    private LocalDate requestedDeliveryDate;

    @Column(length = 500)
    private String notes;

    @Column(nullable = false)
    private Boolean giftWrap;

    @Column(nullable = false, length = 20)
    private String warehouseCode;

    @Column(length = 120)
    private String deliveryLine1;

    @Column(length = 80)
    private String deliveryCity;

    @Column(length = 12)
    private String deliveryPostalCode;

    public static OrderEntity from(OrderRequest request) {
        OrderEntity entity = new OrderEntity();
        entity.apply(request);
        return entity;
    }

    public void apply(OrderRequest request) {
        orderNumber = request.orderNumber();
        status = request.status();
        priority = request.priority();
        customerName = request.customerName();
        customerEmail = request.customerEmail();
        quantity = request.quantity();
        unitPrice = request.unitPrice();
        taxRate = request.taxRate();
        currency = request.currency();
        discountAmount = request.discountAmount();
        countryCode = request.countryCode();
        orderedAt = request.orderedAt();
        requestedDeliveryDate = request.requestedDeliveryDate();
        notes = request.notes();
        giftWrap = request.giftWrap();
        warehouseCode = request.warehouseCode();
        DeliveryAddress address = request.deliveryAddress();
        deliveryLine1 = address == null ? null : address.line1();
        deliveryCity = address == null ? null : address.city();
        deliveryPostalCode = address == null ? null : address.postalCode();
    }

    public Order toRecord() {
        return new Order(
                id,
                orderNumber,
                status,
                priority,
                customerName,
                customerEmail,
                quantity,
                unitPrice,
                taxRate,
                currency,
                discountAmount,
                countryCode,
                orderedAt,
                requestedDeliveryDate,
                notes,
                giftWrap,
                warehouseCode,
                deliveryAddress()
        );
    }

    private DeliveryAddress deliveryAddress() {
        if (deliveryLine1 == null && deliveryCity == null && deliveryPostalCode == null) {
            return null;
        }
        return new DeliveryAddress(deliveryLine1, deliveryCity, deliveryPostalCode);
    }

    public Long getId() {
        return id;
    }
}
