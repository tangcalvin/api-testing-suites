package com.philomath.api.store;

import com.philomath.api.dto.Priority;
import com.philomath.api.dto.Shipment;
import com.philomath.api.dto.ShipmentRequest;
import com.philomath.api.dto.ShipmentStatus;
import com.philomath.api.dto.ShipmentUpdate;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "shipment")
public class ShipmentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40)
    private String reference;

    @Column(nullable = false, length = 80)
    private String recipient;

    @Column(nullable = false, length = 2)
    private String destination;

    @Column(nullable = false)
    private Double weightKg;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Priority priority;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ShipmentStatus status;

    @Column(nullable = false)
    private Boolean insured;

    public static ShipmentEntity from(ShipmentRequest request) {
        ShipmentEntity entity = new ShipmentEntity();
        entity.apply(request.reference(), request.recipient(), request.destination(), request.weightKg(), request.priority(), request.status(), request.insured());
        return entity;
    }

    public void apply(ShipmentUpdate request) {
        apply(request.reference(), request.recipient(), request.destination(), request.weightKg(), request.priority(), request.status(), request.insured());
    }

    private void apply(String reference, String recipient, String destination, Double weightKg, Priority priority, ShipmentStatus status, Boolean insured) {
        this.reference = Text.trim(reference);
        this.recipient = Text.trim(recipient);
        this.destination = Text.trim(destination);
        this.weightKg = weightKg;
        this.priority = priority;
        this.status = status;
        this.insured = insured;
    }

    public Shipment toRecord() {
        return new Shipment(id, reference, recipient, destination, weightKg, priority, status, insured);
    }

    public Long getId() {
        return id;
    }
}
