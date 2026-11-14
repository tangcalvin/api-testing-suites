package com.philomath.api.store;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShipmentRepository extends JpaRepository<ShipmentEntity, Long> {

    Page<ShipmentEntity> findAllByOrderByIdAsc(Pageable pageable);

    Page<ShipmentEntity> findByReferenceContainingIgnoreCaseOrderByIdAsc(String reference, Pageable pageable);
}
