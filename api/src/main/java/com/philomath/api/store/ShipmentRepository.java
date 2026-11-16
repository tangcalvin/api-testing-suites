package com.philomath.api.store;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ShipmentRepository extends JpaRepository<ShipmentEntity, Long> {

    List<ShipmentEntity> findByIdGreaterThanEqualOrderByIdAsc(Long id, Pageable pageable);

    List<ShipmentEntity> findByIdGreaterThanEqualAndReferenceContainingIgnoreCaseOrderByIdAsc(Long id, String reference, Pageable pageable);
}
